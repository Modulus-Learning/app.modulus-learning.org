import { BaseService, method } from '@/lib/base-service.js'
import { classifyScoreSubmissionResponse } from './error-classifier.js'
import type { Config } from '@/config.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AccessTokenManager } from '../services/access-tokens.js'
import type { PlatformRecord } from './repository.js'
import type { RateLimitReading, SubmissionResult } from './types.js'

export type PublishScoreInput = {
  lineitemUrl: string
  ltiUserId: string
  scoreGiven: number // 0..1
}

export type PublishScoreOutcome = {
  result: SubmissionResult
  reading?: RateLimitReading
}

/**
 * The transport boundary for LTI Assignment & Grade Services (AGS) requests to a
 * platform: acquiring the access token, speaking the AGS wire format, and
 * classifying the platform's response into a domain `SubmissionResult`.
 *
 * The submitter uses this interface, so it can be faked in tests without
 * a network; `HttpLtiAgsClient` is the real adapter.
 */
export interface LtiAgsClient {
  readonly issuer: string
  publishScore(input: PublishScoreInput): Promise<PublishScoreOutcome>
}

// The slice of AccessTokenManager the adapter uses. Narrowing to these two
// methods keeps the adapter fakeable without depending on the manager's guts.
type AgsTokenManager = Pick<AccessTokenManager, 'getAccessToken' | 'invalidateAccessToken'>

// The `fetch` seam, injected so the adapter can be unit-tested with a canned
// transport and no global mutation. Defaults to the global `fetch`.
export type FetchFn = typeof fetch

/**
 * HTTP adapter for {@link LtiAgsClient}, targeting Canvas's AGS score endpoint.
 * Owns access-token acquisition (and invalidation on a token-level rejection),
 * the AGS Score payload, the rate-limit header read, and response
 * classification -- everything transport/protocol, so the submitter is left
 * with pure queue/lease orchestration.
 */
export class HttpLtiAgsClient extends BaseService implements LtiAgsClient {
  readonly issuer: string

  private config: Config
  private platform: PlatformRecord
  private accessTokenManager: AgsTokenManager
  private fetchFn: FetchFn

  constructor(deps: {
    logger: CoreLogger
    config: Config
    platform: PlatformRecord
    accessTokenManager: AgsTokenManager
    fetchFn?: FetchFn
  }) {
    super(deps.logger, 'app', 'lti')
    this.config = deps.config
    this.platform = deps.platform
    this.issuer = deps.platform.issuer
    this.accessTokenManager = deps.accessTokenManager
    this.fetchFn = deps.fetchFn ?? fetch
  }

  @method
  async publishScore(input: PublishScoreInput): Promise<PublishScoreOutcome> {
    this.logger.debug(
      {
        issuer: this.issuer,
        progress: input.scoreGiven,
      },
      'submitting score'
    )

    const accessTokenResult = await this.accessTokenManager.getAccessToken(this.platform)
    if (!accessTokenResult.ok) {
      return {
        result: {
          ok: false,
          category: accessTokenResult.category,
          description: accessTokenResult.message,
          status: accessTokenResult.status_code,
        },
      }
    }

    const { accessToken } = accessTokenResult

    const headers = new Headers()
    headers.append('Authorization', `Bearer ${accessToken.token}`)
    headers.append('Content-Type', 'application/x-www-form-urlencoded')

    const body = new URLSearchParams({
      userId: input.ltiUserId,
      activityProgress: input.scoreGiven < 1 ? 'Submitted' : 'Completed',
      gradingProgress: 'FullyGraded',
      timestamp: new Date().toISOString(),
      scoreGiven: input.scoreGiven.toString(),
      scoreMaximum: '1',
    })

    const response = await this.fetchFn(`${input.lineitemUrl}/scores`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(this.config.lti.score_submission.request_timeout_seconds * 1000),
    }).catch((err) => {
      // TODO: Should we handle TimeoutError (from the AbortSignal) differently?
      this.logger.warn({ err, issuer: this.issuer }, 'network error in LTI score submission')
      return null
    })

    if (response == null) {
      return { result: { ok: false, category: 'transient', description: 'network error' } }
    }

    const reading = parseRateLimit(response.headers)
    const status = response.status
    const getText = () =>
      response.text().catch((err) => {
        this.logger.warn(
          { err, status, issuer: this.issuer },
          'error reading LTI score submission response body'
        )
        return ''
      })

    const result = await classifyScoreSubmissionResponse(status, getText)
    if (!result.ok && result.category === 'platform_token') {
      this.accessTokenManager.invalidateAccessToken(this.platform, accessToken)
    }
    return { result, reading }
  }
}

/**
 * Parse Canvas's rate-limit quota headers from a response. Returns `undefined`
 * when `X-Rate-Limit-Remaining` is absent or unparseable (some low-level errors
 * and 5xx responses omit them). Header lookup is case-insensitive.
 */
function parseRateLimit(headers: Headers, at: number = Date.now()): RateLimitReading | undefined {
  const remainingRaw = headers.get('X-Rate-Limit-Remaining')
  if (remainingRaw == null) {
    return undefined
  }
  const remaining = Number.parseFloat(remainingRaw)
  if (Number.isNaN(remaining)) {
    return undefined
  }

  const costRaw = headers.get('X-Request-Cost')
  const cost = costRaw == null ? undefined : Number.parseFloat(costRaw)

  return {
    remaining,
    cost: cost != null && !Number.isNaN(cost) ? cost : undefined,
    at,
  }
}

import type {
  AccessTokenSource,
  LtiAgsClient,
  LtiLogger,
  LtiRegistration,
  PublishScoreInput,
  PublishScoreOutcome,
} from '@modulus-learning/lti'

import { classifyScoreSubmissionResponse } from './error-classifier.js'
import type { RateLimitReading } from './types.js'

// The `fetch` seam, injected so the client can be unit-tested with a canned
// transport and no global mutation. Defaults to the global `fetch`.
export type FetchFn = typeof fetch

/**
 * HTTP client for {@link LtiAgsClient}, targeting Canvas's AGS score endpoint.
 * Owns access-token acquisition (and invalidation on a token-level rejection),
 * the AGS Score payload, the rate-limit header read, and response
 * classification -- everything transport/protocol, so core's submitter is left
 * with pure queue/lease orchestration.
 */
export class HttpLtiAgsClient implements LtiAgsClient {
  readonly issuer: string

  private logger: LtiLogger
  private platform: LtiRegistration
  private accessTokenManager: AccessTokenSource
  private requestTimeoutSeconds: number
  private fetchFn: FetchFn

  constructor(deps: {
    logger: LtiLogger
    registration: LtiRegistration
    accessTokens: AccessTokenSource
    requestTimeoutSeconds: number
    fetchFn?: FetchFn
  }) {
    this.logger = deps.logger
    this.platform = deps.registration
    this.issuer = deps.registration.issuer
    this.accessTokenManager = deps.accessTokens
    this.requestTimeoutSeconds = deps.requestTimeoutSeconds
    this.fetchFn = deps.fetchFn ?? fetch
  }

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
      signal: AbortSignal.timeout(this.requestTimeoutSeconds * 1000),
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

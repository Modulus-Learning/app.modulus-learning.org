import type { AccessToken, AccessTokenResult } from './access-token.js'

/**
 * Score passback (LTI Assignment and Grade Services, AGS): the outcome
 * categories every adapter's client reports, and the client interface core's
 * submission queue drives. The categories' meaning belongs to this contract;
 * recognising a vendor's responses as one of them belongs to the adapter.
 */

export type SubmissionErrorCategory =
  /** A newer score already reached the line item. */
  | 'superseded'
  /** The line item no longer exists; stop sending to it. */
  | 'lineitem_dead'
  /** Retry later; nothing is wrong with the request. */
  | 'transient'
  /** The registration or tool configuration is wrong. */
  | 'platform_config'
  /** The access token was rejected. */
  | 'platform_token'
  /** The platform is throttling. */
  | 'rate_limit'
  /** The request itself was invalid. */
  | 'malformed'
  /** Not recognised; follows the default failure policy. */
  | 'unknown'

export type SubmissionResult =
  | {
      ok: true
    }
  | {
      ok: false
      category: SubmissionErrorCategory
      description: string
      status?: number
      text?: string
    }

export type PublishScoreInput = {
  lineitemUrl: string
  ltiUserId: string
  scoreGiven: number // 0..1
}

export type PublishScoreOutcome = {
  result: SubmissionResult
  /**
   * The response's scheduling signal for the adapter's own pacing policy.
   * Opaque to core, which only passes it on.
   */
  reading?: unknown
}

/**
 * The transport for one registration's AGS requests: acquiring the access
 * token, speaking the wire format, and classifying the response.
 */
export interface LtiAgsClient {
  readonly issuer: string
  publishScore(input: PublishScoreInput): Promise<PublishScoreOutcome>
}

/** An LMS registration, as plain values (core's registration record satisfies it). */
export type LtiRegistration = {
  id: string
  issuer: string
  name: string
  client_id: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  authorization_server: string
}

/**
 * The registration values a platform connection is built from. Two snapshots of
 * one registration with different fingerprints must not share cached tokens or
 * score clients: a corrected client id or endpoint takes effect on the next use.
 */
export const registrationFingerprint = (registration: LtiRegistration): string =>
  JSON.stringify([
    registration.issuer,
    registration.client_id,
    registration.authorization_endpoint,
    registration.token_endpoint,
    registration.jwks_uri,
    registration.authorization_server,
  ])

/** Where a score client obtains, and returns rejected, access tokens. */
export interface AccessTokenSource {
  getAccessToken(registration: LtiRegistration): Promise<AccessTokenResult>
  invalidateAccessToken(registration: LtiRegistration, accessToken: AccessToken): void
}

/** The logging an adapter may do: structured data plus a message. */
export interface LtiLogger {
  debug(data: Record<string, unknown>, message?: string): void
  info(data: Record<string, unknown>, message?: string): void
  warn(data: Record<string, unknown>, message?: string): void
  error(data: Record<string, unknown>, message?: string): void
}

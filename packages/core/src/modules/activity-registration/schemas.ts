import type { NormalizedBaseUrl } from './url-policy.js'

/** Why one URL was refused registration. */
export type RegistrationDenialReason =
  /** No enabled rule matches this previously unseen URL. */
  | 'activity_url_not_allowed'
  /** Not parseable as an admissible absolute URL. */
  | 'malformed_url'
  /** Longer than the 255-character `activities.url` column. */
  | 'url_too_long'

/** One URL that was refused, and why. Carried in the denial error's `details`. */
export type RejectedRegistration = {
  url: string
  reason: RegistrationDenialReason
}

/**
 * The set of enabled rules, read once and then evaluated against repeatedly.
 * An empty set allows every syntactically admissible URL.
 *
 * This is a value, not a service handle, and that is the point: it is what lets
 * one admission operation hold a single snapshot across every URL it is
 * evaluating, so a five-URL submission is decided coherently even if an
 * administrator edits the policy mid-request.
 */
export type PolicySnapshot = { rules: NormalizedBaseUrl[] }

/** The outcome of evaluating one candidate URL against a snapshot. */
export type PolicyEvaluation =
  | { ok: true; url: URL }
  | {
      ok: false
      reason: Extract<RegistrationDenialReason, 'malformed_url' | 'activity_url_not_allowed'>
    }

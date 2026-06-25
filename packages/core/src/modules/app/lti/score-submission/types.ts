export type PendingSubmission = {
  lineitem_id: string
  lineitem_url: string
  platform_issuer: string
  deployment_id: string
  user_id: string
  activity_id: string
  lti_user_id: string
  submission_error_count: number
  submission_error_category: string | null
  cutoff_at: Date | null
  current_progress: number
  submitted_progress: number
}

export type SubmissionErrorCategory =
  | 'superseded'
  | 'lineitem_dead'
  | 'transient'
  | 'platform_config'
  | 'platform_token'
  | 'rate_limit'
  | 'malformed'
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

/**
 * A reading of Canvas's rate-limit quota headers, captured from a submission
 * response. `remaining` is `X-Rate-Limit-Remaining`; `cost` is `X-Request-Cost`
 * (absent on some responses). `at` is when we observed it (ms epoch). Feeds the
 * driver's `QuotaGovernor`.
 */
export type RateLimitReading = {
  remaining: number
  cost?: number
  at: number
}

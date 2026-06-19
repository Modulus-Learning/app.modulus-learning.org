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

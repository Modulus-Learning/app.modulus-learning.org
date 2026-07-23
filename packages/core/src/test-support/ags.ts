import type {
  LtiAgsClient,
  PublishScoreInput,
  PublishScoreOutcome,
} from '@/modules/app/lti/score-submission/ags-client.js'
import type {
  RateLimitReading,
  SubmissionResult,
} from '@/modules/app/lti/score-submission/types.js'

// Outcome builders mirroring what a real platform round-trip would yield, so the
// submitter's mark* selection (success / dead / retryable-failure) can be
// exercised without any HTTP.
export const successResult: SubmissionResult = { ok: true }
export const deadResult: SubmissionResult = {
  ok: false,
  category: 'lineitem_dead',
  description: 'assignment is unpublished',
}
export const retryableResult: SubmissionResult = {
  ok: false,
  category: 'transient',
  description: 'server error',
}

/**
 * Hand-written {@link LtiAgsClient} fake for the service-level integration
 * tests: returns a scripted outcome, records every call, and can run a side
 * effect *before* returning -- used to rotate the line item's lease token
 * mid-call and drive the preemption path.
 */
export class FakeLtiAgsClient implements LtiAgsClient {
  readonly issuer: string
  readonly calls: PublishScoreInput[] = []

  private outcome: PublishScoreOutcome
  private onPublish?: (input: PublishScoreInput) => Promise<void>

  constructor(opts: {
    issuer: string
    result?: SubmissionResult
    reading?: RateLimitReading
    onPublish?: (input: PublishScoreInput) => Promise<void>
  }) {
    this.issuer = opts.issuer
    this.outcome = { result: opts.result ?? successResult, reading: opts.reading }
    this.onPublish = opts.onPublish
  }

  setOutcome(result: SubmissionResult, reading?: RateLimitReading): void {
    this.outcome = { result, reading }
  }

  async publishScore(input: PublishScoreInput): Promise<PublishScoreOutcome> {
    this.calls.push(input)
    if (this.onPublish) {
      await this.onPublish(input)
    }
    return this.outcome
  }
}

import { z } from 'zod'

import { normalizeActivityUrl } from '@/modules/activity-registration/activity-url.js'

/*
 * A single cumulative ("umbrella") contribution target in a `set-progress`
 * submission.
 *
 * `url` identifies the *other* activity this one reports a calculation of its own
 * progress against; the source is the implicit self (token-bound) activity.
 * `factor` is the normalized (0..1) share of the self activity's progress that
 * flows to `url`.  The server does NOT receive a precomputed increment: it
 * observes the change in the self activity's idempotent high-water mark and
 * applies `Δself × factor` to `url`.  Deriving the increment from the idempotent
 * self change makes the umbrella update idempotent too (a retried submission sees
 * no self change and so contributes nothing).
 *
 * `factor` is required to be finite (z.number() automatically does this).  Values
 * outside of `[0,1]` will be clamped rather than rejecting the whole submission.
 */
const progressUpdateSchema = z.object({
  url: z.string(),
  factor: z.number(),
})

/*
 * Progress for a single activity addressed by URL, returned for the additional
 * activities requested in a `get-progress` call.
 */
const progressResultSchema = z.object({
  url: z.string(),
  progress: z.number(),
})

/*
 * The request can name additional activities (by URL) for which the agent wants
 * progress -- e.g. a cumulative page reading the activities that report into it.
 * Self (the token-bound activity) is always included in the response.
 */
export const getProgressSchemas = {
  input: z.object({
    urls: z.array(z.string()).optional(),
  }),
  output: z.object({
    // Self (token-bound activity) progress.
    progress: z.number(),
    // Progress for each additionally-requested activity URL.  Populated in
    // Phase 2, once multi-URL reads land.
    others: z.array(progressResultSchema).optional(),
    new_token: z.string().optional(),
  }),
}

/*
 * The request carries the self activity's progress (an idempotent high-water
 * mark) plus zero or more cumulative contribution targets (by url + factor) that
 * this activity reports a calculation against.
 *
 * `progress_for_current_page` must be a finite number; values outside of `[0,1]`
 * will be clamped.  Duplicate target URLs -- repeated strings, or spellings that
 * canonicalize to the same activity URL -- are an authoring error and are
 * rejected here; a self-referencing target (a URL resolving to the current
 * activity) is rejected by the server.
 */
/**
 * Why one cumulative target was refused.
 *
 * The first three are `RegistrationDenialReason` verbatim: this path names the
 * shared registration service's own denial vocabulary rather than defining a
 * parallel one that could drift from it. Only `self_reference` is added here,
 * because it needs the reporting activity's id and is therefore this caller's
 * check rather than the service's.
 */
export const rejectedTargetReasonSchema = z.enum([
  // No enabled allowlist rule matches this previously unseen URL.
  'activity_url_not_allowed',
  // Not parseable as an admissible absolute URL.
  'malformed_url',
  // Longer than the 255-character `activities.url` column.
  'url_too_long',
  // The target is the reporting activity itself.
  'self_reference',
])

export type RejectedTargetReason = z.infer<typeof rejectedTargetReasonSchema>

export const rejectedTargetSchema = z.object({
  url: z.string(),
  reason: rejectedTargetReasonSchema,
})

export type RejectedTarget = z.infer<typeof rejectedTargetSchema>

/**
 * Whether two cumulative targets name the same activity.
 *
 * Repeated raw strings are checked first, so an identical malformed URL is
 * still a duplicate. Canonical keys are then compared only for inputs that
 * parse: every parse failure normalizes to `null`, and two *different*
 * malformed URLs must not collide on it. They remain separate targets that
 * registration refuses one at a time.
 *
 * Canonical duplicates (`https://content.test:443/a` and
 * `https://CONTENT.test/a?x=1`, say) resolve to one activity, and there is no
 * sound way to choose or combine their factors, so the page's authored markup
 * is wrong and the whole submission is refused here, before the handler runs.
 */
const hasDuplicateTargets = (targets: { url: string }[]): boolean => {
  const urls = targets.map((t) => t.url)
  if (new Set(urls).size !== urls.length) {
    return true
  }

  const keys = urls.map(normalizeActivityUrl).filter((key): key is string => key !== null)
  return new Set(keys).size !== keys.length
}

export const setProgressSchemas = {
  input: z.object({
    progress_for_current_page: z.number(),
    // The message never echoes a target: `CoreUtils.zodParse()` logs every
    // issue, and a target URL can carry query or fragment values.
    increments_for_other_pages: z
      .array(progressUpdateSchema)
      .refine((targets) => !hasDuplicateTargets(targets), {
        message: 'increments_for_other_pages contains duplicate target URLs',
      }),
  }),
  output: z.object({
    // Resulting self (token-bound activity) high-water-mark progress.
    progress: z.number(),
    // Resulting progress for each reported-against activity.  Populated in
    // Phase 2, once transactional multi-activity writes land.
    others: z.array(progressResultSchema).optional(),
    // Targets that were refused, each with the reason and its submitted `url`
    // spelling. An admission or self-reference refusal is per target and never
    // fails the submission carrying it: the target list comes from the page's
    // authored markup, so failing would stop that page reporting progress
    // permanently -- including the learner's own valid self high-water mark.
    //
    // Request validation is the explicit exception. It runs before the
    // handler, so a failure there -- including duplicate targets, whether
    // repeated strings or canonically equivalent spellings -- rejects the
    // entire submission with `ERR_VALIDATION`, self progress included, and
    // nothing appears here.
    //
    // Omitted rather than empty when every target was accepted, matching how
    // `others` is already handled.
    rejected_targets: z.array(rejectedTargetSchema).optional(),
    new_token: z.string().optional(),
  }),
}

export const getPageStateSchemas = {
  input: z.void(),
  output: z.object({
    page_state: z.any(),
    new_token: z.string().optional(),
  }),
}

export const setPageStateSchemas = {
  input: z.object({
    page_state: z.any(),
  }),
  output: z.object({
    new_token: z.string().optional(),
  }),
}

export type GetProgressRequest = z.infer<typeof getProgressSchemas.input>
export type GetProgressResponse = z.infer<typeof getProgressSchemas.output>
export type SetProgressRequest = z.infer<typeof setProgressSchemas.input>
export type SetProgressResponse = z.infer<typeof setProgressSchemas.output>

export type GetPageStateResponse = z.infer<typeof getPageStateSchemas.output>
export type SetPageStateRequest = z.infer<typeof setPageStateSchemas.input>
export type SetPageStateResponse = z.infer<typeof setPageStateSchemas.output>

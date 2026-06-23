import { z } from 'zod'

/*
 * A single progress target in a `set-progress` submission.
 *
 * `url` identifies the activity the value applies to.  When omitted, the value
 * applies to the "self" activity -- the one the agent's access token is bound
 * to.  Entries that carry a `url` are activities this one reports a *calculation*
 * of its own progress against (cumulative / "umbrella" reporting); their source
 * is the implicit self activity.
 */
const progressUpdateSchema = z.object({
  url: z.string().optional(),
  progress: z.number(),
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
 * The request is a list of progress targets: the self activity (url omitted)
 * plus zero or more activities this one reports a calculation against.
 */
export const setProgressSchemas = {
  input: z.object({
    updates: z.array(progressUpdateSchema),
  }),
  output: z.object({
    // Resulting self (token-bound activity) high-water-mark progress.
    progress: z.number(),
    // Resulting progress for each reported-against activity.  Populated in
    // Phase 2, once transactional multi-activity writes land.
    others: z.array(progressResultSchema).optional(),
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

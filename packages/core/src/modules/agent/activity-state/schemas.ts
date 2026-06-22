import { z } from 'zod'

/*
 The request is no longer input void - it can be a list of URLs
 for which the agent wants progress.
*/
export const getProgressSchemas = {
  input: z.void(),
  output: z.object({
    progress: z.number(),
    new_token: z.string().optional(),
  }),
}

/**
 * To be updated to take  a list of URLs to be updated.
 */
export const setProgressSchemas = {
  input: z.object({
    progress: z.number(),
  }),
  output: z.object({
    progress: z.number(),
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

export type GetProgressResponse = z.infer<typeof getProgressSchemas.output>
export type SetProgressRequest = z.infer<typeof setProgressSchemas.input>
export type SetProgressResponse = z.infer<typeof setProgressSchemas.output>

export type GetPageStateResponse = z.infer<typeof getPageStateSchemas.output>
export type SetPageStateRequest = z.infer<typeof setPageStateSchemas.input>
export type SetPageStateResponse = z.infer<typeof setPageStateSchemas.output>

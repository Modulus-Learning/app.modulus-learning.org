import { z } from 'zod'

export interface LearnerRegistrationFormState {
  errors: {
    username?: string[]
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export const learnerRegistrationFormSchema = z.object({
  username: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Username is required.' : 'Username must be a string.',
    })
    .min(1, {
      error: 'Username is required',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Username cannot be empty.'),
})

export interface Activity {
  urls: string[]
}

export const startActivitySchema = z.object({
  activity_code: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? 'Activity code is required.'
          : 'Activity code must be a string.',
    })
    .min(4, {
      error: 'Valid activity code is required',
    })
    // TODO: check!!!
    .max(26, {
      error: 'Activity code is too long.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Activity code cannot be empty.'),
  activity_url: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Activity URL is required.' : 'Activity URL must be a string.',
    })
    .min(4, {
      error: 'Valid activity URL is required',
    })
    // TODO: check!!!
    .max(256, {
      error: 'Activity URL is too long.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Activity URL cannot be empty.'),
})

export interface StartActivityResult {
  status: 'success' | 'failed' | 'needs_user'
  message: string
  data?: {
    user: {
      id: string
      // username: string | null
      full_name?: string
    }
    activity_code: {
      id: string
      code: string
    }
    activity: {
      id: string
      url: string
    }
    modulus_server_url: string
  }
  // token?: string
}

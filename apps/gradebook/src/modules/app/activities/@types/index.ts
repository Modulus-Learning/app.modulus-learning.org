import { booleanSchema, integerFromStringSchema } from '@infonomic/schemas'
import { z } from 'zod'

export interface ActivityCodeRequestFormState {
  errors: {
    code?: string[] | undefined
  }
  message?: string
  code?: string
  status: 'success' | 'failed' | 'idle'
}

export interface ActivityCodeRequest {
  code: string
}

export interface ActivityCodeFormState {
  errors: {
    urls?: string[]
  }
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export const activityCodeFormSchema = z.object({
  code: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Code is required.' : 'Code must be a string.',
    })
    .min(3, {
      error: 'Code must be 8 or more characters long.',
    })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, 'Code cannot be empty.'),
})

export interface Activity {
  id: string
  url: string
  name?: string
  created_at: string
  updated_at: string
}

export interface ActivityCode {
  id: string
  user_id: string
  code: string
  private_code: string
  created_at: string
  updated_at: string
}

export interface Progress {
  user_id: string
  full_name: string | null
  activity_code: string
  activity_code_id: string
  progress: number | null
  updated_at: string | null
  created_at: string | null
  activity_name: string | null
  activity_url: string
}

export interface ProgressResponse {
  progress: Progress[] | null
  included: {
    activity_code: ActivityCode | null
  }
  meta: {
    page: number
    page_size: number
    total: number
    total_pages: number
    query?: string | undefined
    order: string
    desc: boolean
  }
}

export const validateSearchParamsSchema = z.strictObject({
  page: integerFromStringSchema.optional().prefault(1),
  page_size: integerFromStringSchema.optional().prefault(10),
  order: z.enum(['updated_at', 'full_name', 'progress']).prefault('updated_at'),
  query: z.string().max(128, 'query must be a string with a maximum of 128 characters').optional(),
  desc: booleanSchema(true),
}) // Ensures no extra properties are allowed

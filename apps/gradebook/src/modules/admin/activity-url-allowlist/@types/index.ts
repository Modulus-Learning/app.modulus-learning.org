import { z } from 'zod'

export interface AllowlistRule {
  id: string
  base_url: string
  origin: string
  path_prefix: string
  description: string | null
  is_enabled: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface AllowlistRulesResponse {
  rules: AllowlistRule[]
}

export interface AllowlistRuleResponse {
  rule: AllowlistRule | null
}

export interface AllowlistImpact {
  total_activities: number
  grandfathered_count: number
  grandfathered_sample: { id: string; url: string }[]
}

/**
 * The outcome of a create submission.
 *
 * `already_enabled` and `disabled_match` are **not** failures: the base URL
 * normalized onto a rule that already exists, so nothing was written and the
 * administrator is shown what is already there. Only `failed` is an error.
 */
export interface AllowlistRuleFormState {
  errors: {
    base_url?: string[] | undefined
    description?: string[] | undefined
  }
  message?: string
  /** The rule an `already_enabled` or `disabled_match` outcome collided with. */
  existing?: AllowlistRule
  status: 'success' | 'already_enabled' | 'disabled_match' | 'failed' | 'idle'
}

export interface AllowlistRuleDeleteState {
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export interface AllowlistImpactState {
  impact?: AllowlistImpact
  message?: string
  status: 'success' | 'failed' | 'idle'
}

/**
 * Client-side feedback only. Core re-validates every base URL and is the
 * enforcement boundary; nothing here is a final decision. It is deliberately
 * looser than core's parser -- it exists to catch a typo before a round trip,
 * not to duplicate the admission syntax.
 */
const baseUrlSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined ? 'A base URL is required.' : 'Base URL must be a string.',
  })
  .min(1, { error: 'A base URL is required.' })
  .max(255, {
    error:
      'Base URL must not be greater than 255 characters. A longer rule could never match an activity URL.',
  })
  .transform((value) => value.trim())
  .refine(
    (value) =>
      /^https:\/\/[^/\s]+/.test(value) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?/.test(value),
    {
      error:
        'Base URL must be an absolute HTTPS URL, or an HTTP localhost/127.0.0.1 URL for local development.',
    }
  )

const descriptionSchema = z
  .string()
  .max(1024, { error: 'Description must not be greater than 1024 characters.' })
  .optional()

export const allowlistRuleCreateSchema = z.object({
  base_url: baseUrlSchema,
  description: descriptionSchema,
})

export const allowlistRuleEditSchema = z.object({
  id: z.uuid(),
  description: descriptionSchema,
  is_enabled: z
    .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('on'), z.null()])
    .transform((value) => value === true || value === 'true' || value === 'on')
    .optional(),
})

export const allowlistRuleDeleteSchema = z.object({
  id: z.uuid(),
  base_url: z.string(),
})

export const allowlistImpactSchema = z.object({
  /**
   * Omitted entirely to preview the policy in force. Present, possibly empty,
   * to preview a prospective one.
   */
  base_urls: z.array(z.string()).optional(),
})

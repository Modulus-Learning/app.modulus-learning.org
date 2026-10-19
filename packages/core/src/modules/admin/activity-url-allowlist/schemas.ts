import { z } from 'zod'

import { toBaseUrl } from '@/modules/activity-registration/url-policy.js'
import type { AllowlistRuleRecord } from '@/modules/activity-registration/repository/index.js'

/**
 * The abilities guarding site trust policy. Two, not five.
 *
 * This departs from the per-verb convention of `lti-platforms:list` and
 * `admin-roles:create|edit|delete`, for a reason specific to this resource: a
 * submitted base URL that normalizes onto an existing disabled rule resolves
 * into an *edit*, so an administrator holding `create` without `edit` would hit
 * a dead end on an ordinary submission with no way to express what they asked
 * for. Mutating the allowlist is one capability, so it is one ability.
 */
export const ALLOWLIST_LIST_ABILITY = 'activity-url-allowlist:list'
export const ALLOWLIST_MANAGE_ABILITY = 'activity-url-allowlist:manage'

/** The greatest length of a rule's derived base URL. See `assertBaseUrlFits`. */
export const MAX_RULE_BASE_URL_LENGTH = 255

export const allowlistRuleSchema = z.strictObject({
  id: z.uuid(),
  /** The human-readable form: origin, plus the path prefix when it is not `/`. */
  base_url: z.string(),
  origin: z.string(),
  path_prefix: z.string(),
  description: z.string().nullable(),
  is_enabled: z.boolean(),
  created_by: z.uuid().nullable(),
  updated_by: z.uuid().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export type AllowlistRule = z.infer<typeof allowlistRuleSchema>

export const toAllowlistRule = ({
  id,
  origin,
  path_prefix,
  description,
  is_enabled,
  created_by,
  updated_by,
  created_at,
  updated_at,
}: AllowlistRuleRecord): AllowlistRule => ({
  id,
  base_url: toBaseUrl({ origin, path_prefix }),
  origin,
  path_prefix,
  description,
  is_enabled,
  created_by,
  updated_by,
  created_at: created_at.toISOString(),
  updated_at: updated_at.toISOString(),
})

export const allowlistRuleListResponseSchema = z.strictObject({
  rules: z.array(allowlistRuleSchema),
})

export type AllowlistRuleListResponse = z.infer<typeof allowlistRuleListResponseSchema>

export const allowlistRuleResponseSchema = z.strictObject({
  rule: allowlistRuleSchema,
})

export type AllowlistRuleResponse = z.infer<typeof allowlistRuleResponseSchema>

export const createAllowlistRuleRequestSchema = z.strictObject({
  base_url: z.string().min(1, 'A base URL is required.'),
  description: z.string().max(1024).nullish(),
})

export type CreateAllowlistRuleRequest = z.infer<typeof createAllowlistRuleRequestSchema>

/**
 * What happened to a create request.
 *
 * Raising a unique-constraint error at an administrator would be the wrong
 * answer: they asked for a *state*, not for an insert. `already_enabled` means
 * the state they asked for already holds. `disabled_match` reports the existing
 * row so the UI can offer to re-enable it through `updateAllowlistRule`, which
 * keeps its description and provenance instead of discarding them.
 */
export const createAllowlistRuleResponseSchema = z.strictObject({
  status: z.enum(['created', 'already_enabled', 'disabled_match']),
  rule: allowlistRuleSchema,
})

export type CreateAllowlistRuleResponse = z.infer<typeof createAllowlistRuleResponseSchema>

export const updateAllowlistRuleRequestSchema = z.strictObject({
  id: z.uuid(),
  description: z.string().max(1024).nullish(),
  is_enabled: z.boolean().optional(),
})

export type UpdateAllowlistRuleRequest = z.infer<typeof updateAllowlistRuleRequestSchema>

export const deleteAllowlistRuleRequestSchema = z.strictObject({
  id: z.uuid(),
})

export type DeleteAllowlistRuleRequest = z.infer<typeof deleteAllowlistRuleRequestSchema>

export const previewAllowlistImpactRequestSchema = z.strictObject({
  /**
   * The prospective policy, as base URLs. An empty list means "no enabled rules", and
   * so previews the allow-all state. Omit the field entirely to preview the
   * policy currently in force.
   */
  base_urls: z.array(z.string().min(1)).optional(),
})

export type PreviewAllowlistImpactRequest = z.infer<typeof previewAllowlistImpactRequestSchema>

/** How many existing activities the prospective policy would not have admitted. */
export const previewAllowlistImpactResponseSchema = z.strictObject({
  total_activities: z.number().int().nonnegative(),
  grandfathered_count: z.number().int().nonnegative(),
  grandfathered_sample: z.array(z.strictObject({ id: z.uuid(), url: z.string() })),
})

export type PreviewAllowlistImpactResponse = z.infer<typeof previewAllowlistImpactResponseSchema>

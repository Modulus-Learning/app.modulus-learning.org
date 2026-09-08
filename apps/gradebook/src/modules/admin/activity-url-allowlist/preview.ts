'use server'

import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import { type AllowlistImpactState, allowlistImpactSchema } from './@types'

/**
 * Counts the existing activities the policy would not admit.
 *
 * Deliberately an explicit action rather than part of the page load: it reads
 * every activity row and matches it in memory, so it runs when an
 * administrator asks a question that needs the answer -- opening a disable or
 * delete confirmation -- and not on every view of the rules list.
 */
export async function previewAllowlistImpact(
  _prevState: AllowlistImpactState,
  formData: FormData
): Promise<AllowlistImpactState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return { message: 'Not logged in.', status: 'failed' }
  }

  const validationResult = allowlistImpactSchema.safeParse({
    excluded_rule_id: formData.get('excluded_rule_id'),
  })

  if (validationResult.success === false) {
    return { message: 'Unable to preview the effect of this policy.', status: 'failed' }
  }

  const core = await getCoreCommands()
  // Resolve the policy when the administrator requests the preview. Passing
  // base_urls explicitly preserves deny-all when the last enabled rule goes.
  const listed = await core.admin.activityUrlAllowlist.listAllowlistRules(adminAuth)
  if (!listed.ok) {
    return { message: 'Unable to preview the effect of this policy.', status: 'failed' }
  }
  const { excluded_rule_id } = validationResult.data
  if (!listed.data.rules.some((rule) => rule.id === excluded_rule_id)) {
    return { message: 'This allowlist rule can no longer be found.', status: 'failed' }
  }
  const base_urls = listed.data.rules
    .filter((rule) => rule.is_enabled && rule.id !== excluded_rule_id)
    .map((rule) => rule.base_url)
  const result = await core.admin.activityUrlAllowlist.previewAllowlistImpact(adminAuth, {
    base_urls,
  })

  if (result.ok) {
    return { impact: result.data, status: 'success' }
  }

  return { message: 'Unable to preview the effect of this policy.', status: 'failed' }
}

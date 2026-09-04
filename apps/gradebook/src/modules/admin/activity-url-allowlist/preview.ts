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

  const submitted = formData.get('base_urls')
  const validationResult = allowlistImpactSchema.safeParse(
    typeof submitted === 'string' && submitted.length > 0
      ? { base_urls: submitted.split(',').filter((value) => value.trim() !== '') }
      : {}
  )

  if (validationResult.success === false) {
    return { message: 'Unable to preview the effect of this policy.', status: 'failed' }
  }

  const core = await getCoreCommands()
  const result = await core.admin.activityUrlAllowlist.previewAllowlistImpact(
    adminAuth,
    validationResult.data
  )

  if (result.ok) {
    return { impact: result.data, status: 'success' }
  }

  return { message: 'Unable to preview the effect of this policy.', status: 'failed' }
}

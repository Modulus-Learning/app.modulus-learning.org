import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { AllowlistRulesResponse } from './@types'

export async function listAllowlistRules(_locale: Locale): Promise<AllowlistRulesResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return { status: 'failed', message: 'Not logged in.' }
  }

  const core = await getCoreCommands()
  const result = await core.admin.activityUrlAllowlist.listAllowlistRules(adminAuth)

  if (result.ok) {
    return { status: 'success', rules: result.data.rules }
  }

  return {
    status: 'failed',
    message:
      result.error.code === 'ERR_FORBIDDEN'
        ? 'You do not have permission to view the activity URL allowlist.'
        : 'Unable to load the activity URL allowlist. Please try again.',
  }
}

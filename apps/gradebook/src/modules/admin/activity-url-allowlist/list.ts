import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { AllowlistRulesResponse } from './@types'

const notOkayResponse: AllowlistRulesResponse = {
  rules: [],
}

export async function listAllowlistRules(_locale: Locale): Promise<AllowlistRulesResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return notOkayResponse
  }

  const core = await getCoreCommands()
  const result = await core.admin.activityUrlAllowlist.listAllowlistRules(adminAuth)

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

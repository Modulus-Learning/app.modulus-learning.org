import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { AllowlistRuleResponse } from './@types'

/**
 * Resolves one rule from the list.
 *
 * There is no read-one command: the rule set is small and administrator-only,
 * and adding a command for the edit page would widen the API surface for no
 * gain.
 */
export async function getAllowlistRule(
  id: string,
  _locale: Locale
): Promise<AllowlistRuleResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return { rule: null }
  }

  const core = await getCoreCommands()
  const result = await core.admin.activityUrlAllowlist.listAllowlistRules(adminAuth)

  if (result.ok) {
    return { rule: result.data.rules.find((rule) => rule.id === id) ?? null }
  }

  return { rule: null }
}

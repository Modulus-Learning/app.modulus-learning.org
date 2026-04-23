import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { AdminRoleResponse } from './@types'

// TODO: consider a response object with status and message
// so that we can communicate more than 'noFound' in the UI.
const notOkayResponse = {
  role: null,
  permissions: null,
}

export async function getAdminRole(id: string, _locale: Locale): Promise<AdminRoleResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return notOkayResponse
  }

  const core = await getCoreCommands()
  const result = await core.admin.adminRoles.getAdminRole(adminAuth, { id })

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

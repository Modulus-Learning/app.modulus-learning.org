import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { RolesResponse } from './@types'

// TODO: consider a response object with status and message
// so that we can communicate more than 'noFound' in the UI.
const notOkayResponse = {
  roles: [],
}

export async function listRoles(_locale: Locale): Promise<RolesResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return notOkayResponse
  }

  const core = await getCoreInstance()
  const result = await core.admin.roles.listRoles(adminAuth)

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

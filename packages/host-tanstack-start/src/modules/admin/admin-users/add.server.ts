import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { AdminUserAddResponse } from './@types'

// TODO: consider a response object with status and message
// so that we can communicate more than 'noFound' in the UI.
const notOkResponse = {
  included: {
    roles: [],
  },
}

export async function addAdminUser(_locale: Locale): Promise<AdminUserAddResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return notOkResponse
  }

  const core = await getCoreCommands()
  const result = await core.admin.adminUsers.addAdminUser(adminAuth)

  if (result.ok) {
    return result.data
  }

  return notOkResponse
}

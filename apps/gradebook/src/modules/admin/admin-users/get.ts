import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { AdminUserResponse } from './@types'

// TODO: consider a response object with status and message
// so that we can communicate more than 'noFound' in the UI.
const notOkayResponse = {
  user: null,
  included: {
    roles: [],
  },
}

export async function getAdminUser(id: string, _locale: Locale): Promise<AdminUserResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return notOkayResponse
  }

  const core = await getCoreInstance()
  const result = await core.admin.adminUsers.getAdminUser(adminAuth, { id })

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

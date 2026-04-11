import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { UserAddResponse } from './@types'

// TODO: consider a response object with status and message
// so that we can communicate more than 'noFound' in the UI.
const notOkResponse = {
  included: {
    roles: [],
  },
}

export async function addUser(_locale: Locale): Promise<UserAddResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return notOkResponse
  }

  const core = await getCoreInstance()
  const result = await core.admin.users.addUser(adminAuth)

  if (result.ok) {
    return result.data
  }

  return notOkResponse
}

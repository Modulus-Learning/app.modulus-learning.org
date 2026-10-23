import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { UserResponse } from './@types'

// TODO: consider a response object with status and message
// so that we can communicate more than 'notOkay' in the UI.
const notOkayResponse = {
  user: null,
  included: {
    roles: [],
  },
}

export async function getAccount(_locale: Locale): Promise<UserResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (!adminAuth) {
    return notOkayResponse
  }

  const core = await getCoreCommands()
  const result = await core.admin.account.getAccount(adminAuth)

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

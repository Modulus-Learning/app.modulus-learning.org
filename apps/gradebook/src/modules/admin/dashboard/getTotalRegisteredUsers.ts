import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { TotalRegisteredUsers } from './@types'

const notOkayResponse: TotalRegisteredUsers = {
  total: 0,
}

export async function getTotalRegisteredUsers(): Promise<TotalRegisteredUsers> {
  const auth = await getCoreAdminRequestContext()
  if (auth == null) {
    return notOkayResponse
  }

  const core = await getCoreCommands()
  const result = await core.admin.reports.getTotalRegisteredUsers(auth)

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

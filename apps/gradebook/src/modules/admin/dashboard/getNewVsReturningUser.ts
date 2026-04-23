import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { NewVsReturningUsers } from './@types'

const notOkayResponse: NewVsReturningUsers = {
  data: [],
  meta: { year: 0 },
  included: { years: [] },
}

export async function getNewVsReturningUsers(
  year: number | undefined
): Promise<NewVsReturningUsers> {
  const auth = await getCoreAdminRequestContext()
  if (auth == null) {
    return notOkayResponse
  }

  const core = await getCoreCommands()
  const result = await core.admin.reports.getNewVsReturningUsers(auth, { year })

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { MonthlyActiveUsers } from './@types'

const notOkayResponse: MonthlyActiveUsers = {
  data: [],
  meta: { year: 0 },
  included: { years: [] },
}

export async function getMonthlyActiveUsers(year: number | undefined): Promise<MonthlyActiveUsers> {
  const auth = await getCoreAdminRequestContext()
  if (auth == null) {
    return notOkayResponse
  }

  const core = await getCoreCommands()
  const result = await core.admin.reports.getMonthlyActiveUsers(auth, { year })

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

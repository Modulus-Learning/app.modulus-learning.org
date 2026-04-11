import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import type { RegistrationsPerDay } from './@types'

const notOkayResponse: RegistrationsPerDay = {
  data: [],
  meta: { year: 0, month: 0 },
  included: { years: [], months: [] },
}

export async function getRegistrationsPerDay(
  year: number | undefined,
  month: number | undefined
): Promise<RegistrationsPerDay> {
  const auth = await getCoreAdminRequestContext()
  if (auth == null) {
    return notOkayResponse
  }

  const core = await getCoreInstance()
  const result = await core.admin.reports.getRegistrationsPerDay(auth, { year, month })

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

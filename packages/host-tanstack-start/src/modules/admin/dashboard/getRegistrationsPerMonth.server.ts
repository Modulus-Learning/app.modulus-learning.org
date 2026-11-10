import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { RegistrationsPerMonth } from './@types'

const notOkayResponse: RegistrationsPerMonth = {
  data: [],
  meta: { year: 0 },
  included: { years: [] },
}

export async function getRegistrationsPerMonth(
  year: number | undefined
): Promise<RegistrationsPerMonth> {
  const auth = await getCoreAdminRequestContext()
  if (auth == null) {
    return notOkayResponse
  }

  const core = await getCoreCommands()
  const result = await core.admin.reports.getRegistrationsPerMonth(auth, { year })

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

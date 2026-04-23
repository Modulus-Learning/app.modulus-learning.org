import type z from 'zod'

import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { UsersResponse, validateSearchParamsSchema } from './@types'

// TODO: consider a response object with status and message
// so that we can communicate more than 'noFound' in the UI.
const notOkayResponse = {
  users: [],
  meta: {
    total: 0,
    page: 0,
    page_size: 10,
    total_pages: 0,
    role: 'all',
    query: '',
    order: 'created_at',
    desc: true,
  },
}

export async function listUsers(
  _locale: Locale,
  params: z.infer<typeof validateSearchParamsSchema>
): Promise<UsersResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return notOkayResponse
  }

  const core = await getCoreCommands()
  const result = await core.admin.users.listUsers(adminAuth, params)

  if (result.ok) {
    return result.data
  }

  return notOkayResponse
}

import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './list.server'

// A native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the read in `./list.server.ts`.

type Args = Parameters<typeof Original.listAdminRoles>

const listAdminRolesFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(1))
  .handler(async ({ data }) => {
    const { listAdminRoles } = await import('./list.server')
    return listAdminRoles(...data)
  })

export const listAdminRoles = (...args: Args) => listAdminRolesFn({ data: args })

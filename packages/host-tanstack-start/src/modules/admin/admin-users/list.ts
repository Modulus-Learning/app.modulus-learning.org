import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './list.server'

// A native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the read in `./list.server.ts`.

type Args = Parameters<typeof Original.listAdminUsers>

const listAdminUsersFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(2))
  .handler(async ({ data }) => {
    const { listAdminUsers } = await import('./list.server')
    return listAdminUsers(...data)
  })

export const listAdminUsers = (...args: Args) => listAdminUsersFn({ data: args })

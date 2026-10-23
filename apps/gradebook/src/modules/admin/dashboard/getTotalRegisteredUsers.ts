import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './getTotalRegisteredUsers.server'

// A native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the read in `./getTotalRegisteredUsers.server.ts`.

type Args = Parameters<typeof Original.getTotalRegisteredUsers>

const getTotalRegisteredUsersFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(0))
  .handler(async ({ data }) => {
    const { getTotalRegisteredUsers } = await import('./getTotalRegisteredUsers.server')
    return getTotalRegisteredUsers(...data)
  })

export const getTotalRegisteredUsers = (...args: Args) => getTotalRegisteredUsersFn({ data: args })

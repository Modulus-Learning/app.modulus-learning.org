import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './get.server'

// A native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the read in `./get.server.ts`.

type Args = Parameters<typeof Original.getAdminRole>

const getAdminRoleFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(2))
  .handler(async ({ data }) => {
    const { getAdminRole } = await import('./get.server')
    return getAdminRole(...data)
  })

export const getAdminRole = (...args: Args) => getAdminRoleFn({ data: args })

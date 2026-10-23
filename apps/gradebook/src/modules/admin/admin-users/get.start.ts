import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './get'

// TanStack Start override of `./get.ts`: a native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the original read unchanged.

type Args = Parameters<typeof Original.getAdminUser>

const getAdminUserFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(2))
  .handler(async ({ data }) => {
    const { getAdminUser } = await import('./get.ts?original')
    return getAdminUser(...data)
  })

export const getAdminUser = (...args: Args) => getAdminUserFn({ data: args })

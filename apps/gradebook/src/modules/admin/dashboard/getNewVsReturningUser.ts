import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './getNewVsReturningUser.server'

// A native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the read in `./getNewVsReturningUser.server.ts`.

type Args = Parameters<typeof Original.getNewVsReturningUsers>

const getNewVsReturningUsersFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(1))
  .handler(async ({ data }) => {
    const { getNewVsReturningUsers } = await import('./getNewVsReturningUser.server')
    return getNewVsReturningUsers(...data)
  })

export const getNewVsReturningUsers = (...args: Args) => getNewVsReturningUsersFn({ data: args })

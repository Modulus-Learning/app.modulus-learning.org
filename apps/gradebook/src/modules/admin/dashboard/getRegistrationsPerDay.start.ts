import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './getRegistrationsPerDay'

// TanStack Start override of `./getRegistrationsPerDay.ts`: a native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the original read unchanged.

type Args = Parameters<typeof Original.getRegistrationsPerDay>

const getRegistrationsPerDayFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(2))
  .handler(async ({ data }) => {
    const { getRegistrationsPerDay } = await import('./getRegistrationsPerDay.ts?original')
    return getRegistrationsPerDay(...data)
  })

export const getRegistrationsPerDay = (...args: Args) => getRegistrationsPerDayFn({ data: args })

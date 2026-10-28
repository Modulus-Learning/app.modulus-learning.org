import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './getRegistrationsPerMonth.server'

// A native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the read in `./getRegistrationsPerMonth.server.ts`.

type Args = Parameters<typeof Original.getRegistrationsPerMonth>

const getRegistrationsPerMonthFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(1))
  .handler(async ({ data }) => {
    const { getRegistrationsPerMonth } = await import('./getRegistrationsPerMonth.server')
    return getRegistrationsPerMonth(...data)
  })

export const getRegistrationsPerMonth = (...args: Args) =>
  getRegistrationsPerMonthFn({ data: args })

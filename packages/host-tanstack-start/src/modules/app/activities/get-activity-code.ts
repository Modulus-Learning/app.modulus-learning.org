import { createServerFn } from '@tanstack/react-start'

import { appSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './get-activity-code.server'

// A native GET server function behind
// the app session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the read in `./get-activity-code.server.ts`.

type Args = Parameters<typeof Original.getActivityCode>

const getActivityCodeFn = createServerFn({ method: 'GET' })
  .middleware([appSessionMiddleware])
  .validator(argumentList<Args>(1))
  .handler(async ({ data }) => {
    const { getActivityCode } = await import('./get-activity-code.server')
    return getActivityCode(...data)
  })

export const getActivityCode = (...args: Args) => getActivityCodeFn({ data: args })

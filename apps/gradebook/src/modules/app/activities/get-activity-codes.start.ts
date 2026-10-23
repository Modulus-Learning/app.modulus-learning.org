import { createServerFn } from '@tanstack/react-start'

import { appSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './get-activity-codes'

// TanStack Start override of `./get-activity-codes.ts`: a native GET server function behind
// the app session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the original read unchanged.

type Args = Parameters<typeof Original.getActivityCodes>

const getActivityCodesFn = createServerFn({ method: 'GET' })
  .middleware([appSessionMiddleware])
  .validator(argumentList<Args>(0))
  .handler(async ({ data }) => {
    const { getActivityCodes } = await import('./get-activity-codes.ts?original')
    return getActivityCodes(...data)
  })

export const getActivityCodes = (...args: Args) => getActivityCodesFn({ data: args })

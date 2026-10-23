import { createServerFn } from '@tanstack/react-start'

import { appSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './get-activities'

// TanStack Start override of `./get-activities.ts`: a native GET server function behind
// the app session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the original read unchanged.

type Args = Parameters<typeof Original.getActivities>

const getActivitiesFn = createServerFn({ method: 'GET' })
  .middleware([appSessionMiddleware])
  .validator(argumentList<Args>(1))
  .handler(async ({ data }) => {
    const { getActivities } = await import('./get-activities.ts?original')
    return getActivities(...data)
  })

export const getActivities = (...args: Args) => getActivitiesFn({ data: args })

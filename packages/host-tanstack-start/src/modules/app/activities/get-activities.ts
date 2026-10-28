import { createServerFn } from '@tanstack/react-start'

import { appSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './get-activities.server'

// A native GET server function behind
// the app session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the read in `./get-activities.server.ts`.

type Args = Parameters<typeof Original.getActivities>

const getActivitiesFn = createServerFn({ method: 'GET' })
  .middleware([appSessionMiddleware])
  .validator(argumentList<Args>(1))
  .handler(async ({ data }) => {
    const { getActivities } = await import('./get-activities.server')
    return getActivities(...data)
  })

export const getActivities = (...args: Args) => getActivitiesFn({ data: args })

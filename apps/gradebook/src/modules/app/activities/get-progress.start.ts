import { createServerFn } from '@tanstack/react-start'

import { appSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './get-progress'

// TanStack Start override of `./get-progress.ts`: a native GET server function behind
// the app session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the original read unchanged.

type Args = Parameters<typeof Original.getProgress>

const getProgressFn = createServerFn({ method: 'GET' })
  .middleware([appSessionMiddleware])
  .validator(argumentList<Args>(2))
  .handler(async ({ data }) => {
    const { getProgress } = await import('./get-progress.ts?original')
    return getProgress(...data)
  })

export const getProgress = (...args: Args) => getProgressFn({ data: args })

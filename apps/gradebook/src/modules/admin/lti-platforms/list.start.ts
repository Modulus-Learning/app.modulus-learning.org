import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './list'

// TanStack Start override of `./list.ts`: a native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the original read unchanged.

type Args = Parameters<typeof Original.listLtiPlatforms>

const listLtiPlatformsFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(1))
  .handler(async ({ data }) => {
    const { listLtiPlatforms } = await import('./list.ts?original')
    return listLtiPlatforms(...data)
  })

export const listLtiPlatforms = (...args: Args) => listLtiPlatformsFn({ data: args })

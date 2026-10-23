import { createServerFn } from '@tanstack/react-start'

import { adminSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './get-account'

// TanStack Start override of `./get-account.ts`: a native GET server function behind
// the admin session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the original read unchanged.

type Args = Parameters<typeof Original.getAccount>

const getAccountFn = createServerFn({ method: 'GET' })
  .middleware([adminSessionMiddleware])
  .validator(argumentList<Args>(1))
  .handler(async ({ data }) => {
    const { getAccount } = await import('./get-account.ts?original')
    return getAccount(...data)
  })

export const getAccount = (...args: Args) => getAccountFn({ data: args })

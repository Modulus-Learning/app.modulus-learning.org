import { createServerFn } from '@tanstack/react-start'

import { appSessionMiddleware } from '@/lib/server-fn'
import { argumentList } from '@/lib/server-fn-guards'
import type * as Original from './list-activity-code-members.server'

// A native GET server function behind
// the app session gate. A route loader calls it in-process during SSR; a client
// navigation calls it remotely and must name the page's principal (see
// `@/lib/server-fn`). The handler runs the read in `./list-activity-code-members.server.ts`.

type Args = Parameters<typeof Original.listActivityCodeMembers>

const listActivityCodeMembersFn = createServerFn({ method: 'GET' })
  .middleware([appSessionMiddleware])
  .validator(argumentList<Args>(1))
  .handler(async ({ data }) => {
    const { listActivityCodeMembers } = await import('./list-activity-code-members.server')
    return listActivityCodeMembers(...data)
  })

export const listActivityCodeMembers = (...args: Args) => listActivityCodeMembersFn({ data: args })

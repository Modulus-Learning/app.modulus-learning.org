import { createServerFn } from '@tanstack/react-start'

import { actionEnvelope, followOutcome, readActionArgs } from '@/lib/server-action'
import { appSessionMiddleware } from '@/lib/server-fn'
import type * as Logic from './search-instructors.server'

// Form-action server functions behind the learner session gate: the logic is
// in `./search-instructors.server.ts`; see `@/lib/server-action` for the envelope.

const searchInstructorsFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .validator((data: FormData) => readActionArgs(data))
  .handler(async ({ data }) => {
    const [logic, { runAction }] = await Promise.all([
      import('./search-instructors.server'),
      import('@/lib/server-action.server'),
    ])
    return runAction(() =>
      logic.searchInstructors(...(data as Parameters<typeof Logic.searchInstructors>))
    )
  })

export const searchInstructors = async (
  ...args: Parameters<typeof Logic.searchInstructors>
): Promise<Awaited<ReturnType<typeof Logic.searchInstructors>>> =>
  followOutcome(await searchInstructorsFn({ data: actionEnvelope(args) }))

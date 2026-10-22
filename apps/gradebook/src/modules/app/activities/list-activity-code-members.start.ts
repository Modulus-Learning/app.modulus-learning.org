import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './list-activity-code-members'

// TanStack Start override of `./list-activity-code-members.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const listActivityCodeMembers = bridgeAction<
  Parameters<typeof Original.listActivityCodeMembers>,
  Awaited<ReturnType<typeof Original.listActivityCodeMembers>>
>('app', 'app/activities/list-activity-code-members', 'listActivityCodeMembers')

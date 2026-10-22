import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './remove-activity-code-member'

// TanStack Start override of `./remove-activity-code-member.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const removeActivityCodeMember = bridgeAction<
  Parameters<typeof Original.removeActivityCodeMember>,
  Awaited<ReturnType<typeof Original.removeActivityCodeMember>>
>('app', 'app/activities/remove-activity-code-member', 'removeActivityCodeMember')

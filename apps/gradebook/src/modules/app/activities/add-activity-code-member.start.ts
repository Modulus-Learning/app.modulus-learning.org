import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './add-activity-code-member'

// TanStack Start override of `./add-activity-code-member.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const addActivityCodeMember = bridgeAction<
  Parameters<typeof Original.addActivityCodeMember>,
  Awaited<ReturnType<typeof Original.addActivityCodeMember>>
>('app', 'app/activities/add-activity-code-member', 'addActivityCodeMember')

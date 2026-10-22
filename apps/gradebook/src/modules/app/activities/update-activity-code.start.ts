import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './update-activity-code'

// TanStack Start override of `./update-activity-code.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const updateActivityCode = bridgeAction<
  Parameters<typeof Original.updateActivityCode>,
  Awaited<ReturnType<typeof Original.updateActivityCode>>
>('app', 'app/activities/update-activity-code', 'updateActivityCode')

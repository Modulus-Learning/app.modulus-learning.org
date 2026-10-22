import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './get-activity-code'

// TanStack Start override of `./get-activity-code.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getActivityCode = bridgeAction<
  Parameters<typeof Original.getActivityCode>,
  Awaited<ReturnType<typeof Original.getActivityCode>>
>('app', 'app/activities/get-activity-code', 'getActivityCode')

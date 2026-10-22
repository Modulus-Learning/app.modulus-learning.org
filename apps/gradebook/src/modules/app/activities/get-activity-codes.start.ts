import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './get-activity-codes'

// TanStack Start override of `./get-activity-codes.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getActivityCodes = bridgeAction<
  Parameters<typeof Original.getActivityCodes>,
  Awaited<ReturnType<typeof Original.getActivityCodes>>
>('app', 'app/activities/get-activity-codes', 'getActivityCodes')

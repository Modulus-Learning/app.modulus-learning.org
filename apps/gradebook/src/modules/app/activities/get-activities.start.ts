import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './get-activities'

// TanStack Start override of `./get-activities.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getActivities = bridgeAction<
  Parameters<typeof Original.getActivities>,
  Awaited<ReturnType<typeof Original.getActivities>>
>('app', 'app/activities/get-activities', 'getActivities')

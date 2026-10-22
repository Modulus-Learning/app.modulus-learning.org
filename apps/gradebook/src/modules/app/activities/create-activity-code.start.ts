import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './create-activity-code'

// TanStack Start override of `./create-activity-code.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const createActivityCode = bridgeAction<
  Parameters<typeof Original.createActivityCode>,
  Awaited<ReturnType<typeof Original.createActivityCode>>
>('app', 'app/activities/create-activity-code', 'createActivityCode')

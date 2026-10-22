import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './delete-activity-code'

// TanStack Start override of `./delete-activity-code.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const deleteActivityCode = bridgeAction<
  Parameters<typeof Original.deleteActivityCode>,
  Awaited<ReturnType<typeof Original.deleteActivityCode>>
>('app', 'app/activities/delete-activity-code', 'deleteActivityCode')

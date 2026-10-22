import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './request-activity-code'

// TanStack Start override of `./request-activity-code.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const requestActivityCode = bridgeAction<
  Parameters<typeof Original.requestActivityCode>,
  Awaited<ReturnType<typeof Original.requestActivityCode>>
>('app', 'app/activities/request-activity-code', 'requestActivityCode')

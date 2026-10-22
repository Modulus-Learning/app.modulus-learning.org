import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './getNewVsReturningUser'

// TanStack Start override of `./getNewVsReturningUser.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getNewVsReturningUsers = bridgeAction<
  Parameters<typeof Original.getNewVsReturningUsers>,
  Awaited<ReturnType<typeof Original.getNewVsReturningUsers>>
>('admin', 'admin/dashboard/getNewVsReturningUser', 'getNewVsReturningUsers')

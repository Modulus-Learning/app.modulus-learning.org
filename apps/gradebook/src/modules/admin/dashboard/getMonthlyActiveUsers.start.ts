import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './getMonthlyActiveUsers'

// TanStack Start override of `./getMonthlyActiveUsers.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getMonthlyActiveUsers = bridgeAction<
  Parameters<typeof Original.getMonthlyActiveUsers>,
  Awaited<ReturnType<typeof Original.getMonthlyActiveUsers>>
>('admin', 'admin/dashboard/getMonthlyActiveUsers', 'getMonthlyActiveUsers')

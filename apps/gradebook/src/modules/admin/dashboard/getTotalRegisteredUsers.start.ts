import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './getTotalRegisteredUsers'

// TanStack Start override of `./getTotalRegisteredUsers.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getTotalRegisteredUsers = bridgeAction<
  Parameters<typeof Original.getTotalRegisteredUsers>,
  Awaited<ReturnType<typeof Original.getTotalRegisteredUsers>>
>('admin', 'admin/dashboard/getTotalRegisteredUsers', 'getTotalRegisteredUsers')

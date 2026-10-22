import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './list'

// TanStack Start override of `./list.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const listAdminUsers = bridgeAction<
  Parameters<typeof Original.listAdminUsers>,
  Awaited<ReturnType<typeof Original.listAdminUsers>>
>('admin', 'admin/admin-users/list', 'listAdminUsers')

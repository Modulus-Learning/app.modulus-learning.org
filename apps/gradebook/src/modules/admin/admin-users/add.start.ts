import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './add'

// TanStack Start override of `./add.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const addAdminUser = bridgeAction<
  Parameters<typeof Original.addAdminUser>,
  Awaited<ReturnType<typeof Original.addAdminUser>>
>('admin', 'admin/admin-users/add', 'addAdminUser')

import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './delete'

// TanStack Start override of `./delete.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const deleteAdminUser = bridgeAction<
  Parameters<typeof Original.deleteAdminUser>,
  Awaited<ReturnType<typeof Original.deleteAdminUser>>
>('admin', 'admin/admin-users/delete', 'deleteAdminUser')

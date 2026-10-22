import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './delete'

// TanStack Start override of `./delete.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const deleteAdminRole = bridgeAction<
  Parameters<typeof Original.deleteAdminRole>,
  Awaited<ReturnType<typeof Original.deleteAdminRole>>
>('admin', 'admin/admin-roles/delete', 'deleteAdminRole')

import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './edit'

// TanStack Start override of `./edit.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const editAdminRole = bridgeAction<
  Parameters<typeof Original.editAdminRole>,
  Awaited<ReturnType<typeof Original.editAdminRole>>
>('admin', 'admin/admin-roles/edit', 'editAdminRole')

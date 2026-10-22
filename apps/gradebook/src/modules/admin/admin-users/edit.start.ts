import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './edit'

// TanStack Start override of `./edit.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const editAdminUser = bridgeAction<
  Parameters<typeof Original.editAdminUser>,
  Awaited<ReturnType<typeof Original.editAdminUser>>
>('admin', 'admin/admin-users/edit', 'editAdminUser')

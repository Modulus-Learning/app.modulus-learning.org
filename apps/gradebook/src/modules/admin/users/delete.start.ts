import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './delete'

// TanStack Start override of `./delete.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const deleteUser = bridgeAction<
  Parameters<typeof Original.deleteUser>,
  Awaited<ReturnType<typeof Original.deleteUser>>
>('admin', 'admin/users/delete', 'deleteUser')

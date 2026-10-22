import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './edit'

// TanStack Start override of `./edit.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const editUser = bridgeAction<
  Parameters<typeof Original.editUser>,
  Awaited<ReturnType<typeof Original.editUser>>
>('admin', 'admin/users/edit', 'editUser')

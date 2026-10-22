import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './add'

// TanStack Start override of `./add.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const addUser = bridgeAction<
  Parameters<typeof Original.addUser>,
  Awaited<ReturnType<typeof Original.addUser>>
>('admin', 'admin/users/add', 'addUser')

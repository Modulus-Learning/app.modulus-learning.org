import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './create'

// TanStack Start override of `./create.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const createAdminUser = bridgeAction<
  Parameters<typeof Original.createAdminUser>,
  Awaited<ReturnType<typeof Original.createAdminUser>>
>('admin', 'admin/admin-users/create', 'createAdminUser')

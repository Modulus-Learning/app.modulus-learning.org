import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './create'

// TanStack Start override of `./create.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const createAdminRole = bridgeAction<
  Parameters<typeof Original.createAdminRole>,
  Awaited<ReturnType<typeof Original.createAdminRole>>
>('admin', 'admin/admin-roles/create', 'createAdminRole')

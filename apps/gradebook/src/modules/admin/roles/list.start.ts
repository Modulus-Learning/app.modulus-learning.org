import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './list'

// TanStack Start override of `./list.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const listRoles = bridgeAction<
  Parameters<typeof Original.listRoles>,
  Awaited<ReturnType<typeof Original.listRoles>>
>('admin', 'admin/roles/list', 'listRoles')

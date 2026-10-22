import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './order'

// TanStack Start override of `./order.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const orderRoles = bridgeAction<
  Parameters<typeof Original.orderRoles>,
  Awaited<ReturnType<typeof Original.orderRoles>>
>('admin', 'admin/roles/order', 'orderRoles')

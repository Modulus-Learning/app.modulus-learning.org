import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './get'

// TanStack Start override of `./get.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getUser = bridgeAction<
  Parameters<typeof Original.getUser>,
  Awaited<ReturnType<typeof Original.getUser>>
>('admin', 'admin/users/get', 'getUser')

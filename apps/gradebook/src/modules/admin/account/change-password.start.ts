import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './change-password'

// TanStack Start override of `./change-password.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const changePassword = bridgeAction<
  Parameters<typeof Original.changePassword>,
  Awaited<ReturnType<typeof Original.changePassword>>
>('admin', 'admin/account/change-password', 'changePassword')

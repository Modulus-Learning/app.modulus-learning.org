import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './change-email'

// TanStack Start override of `./change-email.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const changeEmail = bridgeAction<
  Parameters<typeof Original.changeEmail>,
  Awaited<ReturnType<typeof Original.changeEmail>>
>('admin', 'admin/account/change-email', 'changeEmail')

export const verifyEmail = bridgeAction<
  Parameters<typeof Original.verifyEmail>,
  Awaited<ReturnType<typeof Original.verifyEmail>>
>('admin', 'admin/account/change-email', 'verifyEmail')

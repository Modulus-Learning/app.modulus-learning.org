import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './set-password'

// TanStack Start override of `./set-password.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const setPassword = bridgeAction<
  Parameters<typeof Original.setPassword>,
  Awaited<ReturnType<typeof Original.setPassword>>
>('app', 'app/account/set-password', 'setPassword')

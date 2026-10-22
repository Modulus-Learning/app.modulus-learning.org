import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './get-account'

// TanStack Start override of `./get-account.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getAccount = bridgeAction<
  Parameters<typeof Original.getAccount>,
  Awaited<ReturnType<typeof Original.getAccount>>
>('admin', 'admin/account/get-account', 'getAccount')

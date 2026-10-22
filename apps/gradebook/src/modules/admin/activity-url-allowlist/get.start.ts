import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './get'

// TanStack Start override of `./get.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getAllowlistRule = bridgeAction<
  Parameters<typeof Original.getAllowlistRule>,
  Awaited<ReturnType<typeof Original.getAllowlistRule>>
>('admin', 'admin/activity-url-allowlist/get', 'getAllowlistRule')

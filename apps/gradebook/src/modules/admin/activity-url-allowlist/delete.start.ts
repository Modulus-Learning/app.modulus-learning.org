import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './delete'

// TanStack Start override of `./delete.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const deleteAllowlistRule = bridgeAction<
  Parameters<typeof Original.deleteAllowlistRule>,
  Awaited<ReturnType<typeof Original.deleteAllowlistRule>>
>('admin', 'admin/activity-url-allowlist/delete', 'deleteAllowlistRule')

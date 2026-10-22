import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './edit'

// TanStack Start override of `./edit.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const editAllowlistRule = bridgeAction<
  Parameters<typeof Original.editAllowlistRule>,
  Awaited<ReturnType<typeof Original.editAllowlistRule>>
>('admin', 'admin/activity-url-allowlist/edit', 'editAllowlistRule')

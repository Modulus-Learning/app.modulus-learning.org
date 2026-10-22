import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './create'

// TanStack Start override of `./create.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const createAllowlistRule = bridgeAction<
  Parameters<typeof Original.createAllowlistRule>,
  Awaited<ReturnType<typeof Original.createAllowlistRule>>
>('admin', 'admin/activity-url-allowlist/create', 'createAllowlistRule')

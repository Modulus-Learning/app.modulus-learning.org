import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './list'

// TanStack Start override of `./list.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const listAllowlistRules = bridgeAction<
  Parameters<typeof Original.listAllowlistRules>,
  Awaited<ReturnType<typeof Original.listAllowlistRules>>
>('admin', 'admin/activity-url-allowlist/list', 'listAllowlistRules')

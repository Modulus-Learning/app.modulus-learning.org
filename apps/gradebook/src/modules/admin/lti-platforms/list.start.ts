import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './list'

// TanStack Start override of `./list.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const listLtiPlatforms = bridgeAction<
  Parameters<typeof Original.listLtiPlatforms>,
  Awaited<ReturnType<typeof Original.listLtiPlatforms>>
>('admin', 'admin/lti-platforms/list', 'listLtiPlatforms')

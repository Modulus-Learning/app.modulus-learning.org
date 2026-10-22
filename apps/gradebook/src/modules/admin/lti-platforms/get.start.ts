import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './get'

// TanStack Start override of `./get.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getLtiPlatform = bridgeAction<
  Parameters<typeof Original.getLtiPlatform>,
  Awaited<ReturnType<typeof Original.getLtiPlatform>>
>('admin', 'admin/lti-platforms/get', 'getLtiPlatform')

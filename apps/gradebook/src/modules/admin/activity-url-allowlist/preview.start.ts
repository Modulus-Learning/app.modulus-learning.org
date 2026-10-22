import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './preview'

// TanStack Start override of `./preview.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const previewAllowlistImpact = bridgeAction<
  Parameters<typeof Original.previewAllowlistImpact>,
  Awaited<ReturnType<typeof Original.previewAllowlistImpact>>
>('admin', 'admin/activity-url-allowlist/preview', 'previewAllowlistImpact')

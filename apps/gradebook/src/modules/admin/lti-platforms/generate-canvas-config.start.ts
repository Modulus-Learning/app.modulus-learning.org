import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './generate-canvas-config'

// TanStack Start override of `./generate-canvas-config.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const generateCanvasConfig = bridgeAction<
  Parameters<typeof Original.generateCanvasConfig>,
  Awaited<ReturnType<typeof Original.generateCanvasConfig>>
>('admin', 'admin/lti-platforms/generate-canvas-config', 'generateCanvasConfig')

import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './get-progress'

// TanStack Start override of `./get-progress.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getProgress = bridgeAction<
  Parameters<typeof Original.getProgress>,
  Awaited<ReturnType<typeof Original.getProgress>>
>('app', 'app/activities/get-progress', 'getProgress')

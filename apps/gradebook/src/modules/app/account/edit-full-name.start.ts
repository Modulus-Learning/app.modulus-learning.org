import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './edit-full-name'

// TanStack Start override of `./edit-full-name.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const editFullName = bridgeAction<
  Parameters<typeof Original.editFullName>,
  Awaited<ReturnType<typeof Original.editFullName>>
>('app', 'app/account/edit-full-name', 'editFullName')

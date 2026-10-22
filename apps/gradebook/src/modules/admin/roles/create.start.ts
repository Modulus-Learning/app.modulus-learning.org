import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './create'

// TanStack Start override of `./create.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const createRole = bridgeAction<
  Parameters<typeof Original.createRole>,
  Awaited<ReturnType<typeof Original.createRole>>
>('admin', 'admin/roles/create', 'createRole')

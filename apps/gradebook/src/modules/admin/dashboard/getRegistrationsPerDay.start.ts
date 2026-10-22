import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './getRegistrationsPerDay'

// TanStack Start override of `./getRegistrationsPerDay.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getRegistrationsPerDay = bridgeAction<
  Parameters<typeof Original.getRegistrationsPerDay>,
  Awaited<ReturnType<typeof Original.getRegistrationsPerDay>>
>('admin', 'admin/dashboard/getRegistrationsPerDay', 'getRegistrationsPerDay')

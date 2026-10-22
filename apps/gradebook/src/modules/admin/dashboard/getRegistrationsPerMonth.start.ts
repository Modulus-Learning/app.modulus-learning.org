import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './getRegistrationsPerMonth'

// TanStack Start override of `./getRegistrationsPerMonth.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const getRegistrationsPerMonth = bridgeAction<
  Parameters<typeof Original.getRegistrationsPerMonth>,
  Awaited<ReturnType<typeof Original.getRegistrationsPerMonth>>
>('admin', 'admin/dashboard/getRegistrationsPerMonth', 'getRegistrationsPerMonth')

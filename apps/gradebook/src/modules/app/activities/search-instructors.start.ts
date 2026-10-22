import { bridgeAction } from '@/lib/action-bridge'
import type * as Original from './search-instructors'

// TanStack Start override of `./search-instructors.ts`: bridged to the original on the
// server (see `@/lib/action-bridge`). Generated stubs; keep the names in step.

export const searchInstructors = bridgeAction<
  Parameters<typeof Original.searchInstructors>,
  Awaited<ReturnType<typeof Original.searchInstructors>>
>('app', 'app/activities/search-instructors', 'searchInstructors')

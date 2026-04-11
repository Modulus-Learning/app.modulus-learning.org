import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  ROLE_MACHINE_NAME_CONFLICT: 'ERR_ROLE_MACHINE_NAME_CONFLICT',
} as const

export const ERR_ROLE_MACHINE_NAME_CONFLICT = createCoreErrorType(
  ErrorCodes.ROLE_MACHINE_NAME_CONFLICT,
  'warn'
)

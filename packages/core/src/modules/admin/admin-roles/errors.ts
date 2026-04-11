import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  ADMIN_ROLE_MACHINE_NAME_CONFLICT: 'ERR_ADMIN_ROLE_MACHINE_NAME_CONFLICT',
} as const

export const ERR_ADMIN_ROLE_MACHINE_NAME_CONFLICT = createCoreErrorType(
  ErrorCodes.ADMIN_ROLE_MACHINE_NAME_CONFLICT,
  'warn'
)

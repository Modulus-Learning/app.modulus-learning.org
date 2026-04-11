import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  ADMIN_USER_EMAIL_CONFLICT: 'ERR_ADMIN_USER_EMAIL_CONFLICT',
} as const

export const ERR_ADMIN_USER_EMAIL_CONFLICT = createCoreErrorType(
  ErrorCodes.ADMIN_USER_EMAIL_CONFLICT,
  'warn'
)

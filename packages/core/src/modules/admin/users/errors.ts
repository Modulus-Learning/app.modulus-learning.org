import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  USER_EMAIL_CONFLICT: 'ERR_USER_EMAIL_CONFLICT',
} as const

export const ERR_USER_EMAIL_CONFLICT = createCoreErrorType(ErrorCodes.USER_EMAIL_CONFLICT, 'warn')

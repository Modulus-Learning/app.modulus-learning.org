import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  CURRENT_PASSWORD: 'ERR_CURRENT_PASSWORD',
  EMAIL_UNCHANGED: 'ERR_EMAIL_UNCHANGED',
  VERIFICATION_CODE_EXPIRED: 'ERR_VERIFICATION_CODE_EXPIRED',
  ERR_VERIFICATION_CODE_INVALID: 'ERR_VERIFICATION_CODE_INVALID',
} as const

export const ERR_CURRENT_PASSWORD = createCoreErrorType(ErrorCodes.CURRENT_PASSWORD)
export const ERR_EMAIL_UNCHANGED = createCoreErrorType(ErrorCodes.EMAIL_UNCHANGED, 'warn')
export const ERR_VERIFICATION_CODE_EXPIRED = createCoreErrorType(
  ErrorCodes.VERIFICATION_CODE_EXPIRED,
  'warn'
)
export const ERR_VERIFICATION_CODE_INVALID = createCoreErrorType(
  ErrorCodes.ERR_VERIFICATION_CODE_INVALID,
  'warn'
)

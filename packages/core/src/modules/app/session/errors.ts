import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  OTHER_LINKED_ACCOUNT: 'ERR_OTHER_LINKED_ACCOUNT',
  ACCOUNT_NOT_LINKED: 'ERR_ACCOUNT_NOT_LINKED',
  NO_OTHER_SIGN_IN: 'ERR_NO_OTHER_SIGN_IN',
  LTI_IDENTITY_CONFLICT: 'ERR_LTI_IDENTITY_CONFLICT',
} as const

export const ERR_OTHER_LINKED_ACCOUNT = createCoreErrorType(ErrorCodes.OTHER_LINKED_ACCOUNT, 'warn')
export const ERR_ACCOUNT_NOT_LINKED = createCoreErrorType(ErrorCodes.ACCOUNT_NOT_LINKED, 'warn')
export const ERR_NO_OTHER_SIGN_IN = createCoreErrorType(ErrorCodes.NO_OTHER_SIGN_IN, 'warn')
export const ERR_LTI_IDENTITY_CONFLICT = createCoreErrorType(
  ErrorCodes.LTI_IDENTITY_CONFLICT,
  'warn'
)

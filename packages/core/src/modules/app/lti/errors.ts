import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  INVALID_LOGIN: 'ERR_INVALID_LOGIN',
  INVALID_LAUNCH: 'ERR_INVALID_LAUNCH',
  DEEP_LINKING: 'ERR_DEEP_LINKING',
  SCORE_PASSBACK: 'ERR_SCORE_PASSBACK',
} as const

export const ERR_INVALID_LOGIN = createCoreErrorType(ErrorCodes.INVALID_LOGIN, 'warn')
export const ERR_INVALID_LAUNCH = createCoreErrorType(ErrorCodes.INVALID_LAUNCH, 'warn')
export const ERR_DEEP_LINKING = createCoreErrorType(ErrorCodes.DEEP_LINKING, 'warn')
export const ERR_SCORE_PASSBACK = createCoreErrorType(ErrorCodes.SCORE_PASSBACK, 'error')

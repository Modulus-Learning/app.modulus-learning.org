import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  JWT_ENCODE: 'ERR_JWT_ENCODE',
} as const

export const ERR_JWT_ENCODE = createCoreErrorType(ErrorCodes.JWT_ENCODE, 'error')

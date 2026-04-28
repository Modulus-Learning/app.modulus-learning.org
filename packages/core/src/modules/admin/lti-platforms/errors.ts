import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  PLATFORM_ISSUER_CONFLICT: 'ERR_PLATFORM_ISSUER_CONFLICT',
} as const

export const ERR_PLATFORM_ISSUER_CONFLICT = createCoreErrorType(
  ErrorCodes.PLATFORM_ISSUER_CONFLICT,
  'warn'
)

import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  INVALID_LOGIN: 'ERR_INVALID_LOGIN',
  INVALID_LAUNCH: 'ERR_INVALID_LAUNCH',
  DEEP_LINKING: 'ERR_DEEP_LINKING',
  DEEP_LINK_PREFIX_MISMATCH: 'ERR_DEEP_LINK_PREFIX_MISMATCH',
  DEEP_LINK_PREFIX_INVALID: 'ERR_DEEP_LINK_PREFIX_INVALID',
  SCORE_PASSBACK: 'ERR_SCORE_PASSBACK',
  LTI_ACCESS_TOKEN: 'ERR_LTI_ACCESS_TOKEN',
} as const

export const ERR_INVALID_LOGIN = createCoreErrorType(ErrorCodes.INVALID_LOGIN, 'warn')
export const ERR_INVALID_LAUNCH = createCoreErrorType(ErrorCodes.INVALID_LAUNCH, 'warn')
export const ERR_DEEP_LINKING = createCoreErrorType(ErrorCodes.DEEP_LINKING, 'warn')
// The two per-code `url_prefix` failures get their own codes so the host can
// attribute each to the right form field: a mismatch is a problem with the
// entered activity URL, an invalid stored prefix is a problem with the code.
export const ERR_DEEP_LINK_PREFIX_MISMATCH = createCoreErrorType(
  ErrorCodes.DEEP_LINK_PREFIX_MISMATCH,
  'warn'
)
export const ERR_DEEP_LINK_PREFIX_INVALID = createCoreErrorType(
  ErrorCodes.DEEP_LINK_PREFIX_INVALID,
  'warn'
)
export const ERR_SCORE_PASSBACK = createCoreErrorType(ErrorCodes.SCORE_PASSBACK, 'error')
export const ERR_LTI_ACCESS_TOKEN = createCoreErrorType(ErrorCodes.LTI_ACCESS_TOKEN, 'error')

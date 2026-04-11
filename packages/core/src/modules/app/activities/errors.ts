import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  ACTIVITY_CODE_GENERATION: 'ERR_ACTIVITY_CODE_GENERATION',
  ACTIVITY_CODE_NOT_FOUND: 'ERR_ACTIVITY_CODE_NOT_FOUND',
  ACTIVITY_NOT_FOUND: 'ERR_ACTIVITY_NOT_FOUND',
  LEARNER_NOT_FOUND: 'ERR_LEARNER_NOT_FOUND',
} as const

export const ERR_ACTIVITY_CODE_GENERATION = createCoreErrorType(ErrorCodes.ACTIVITY_CODE_GENERATION)
export const ERR_ACTIVITY_CODE_NOT_FOUND = createCoreErrorType(
  ErrorCodes.ACTIVITY_CODE_NOT_FOUND,
  'warn'
)
export const ERR_ACTIVITY_NOT_FOUND = createCoreErrorType(ErrorCodes.ACTIVITY_NOT_FOUND, 'warn')
export const ERR_LEARNER_NOT_FOUND = createCoreErrorType(ErrorCodes.LEARNER_NOT_FOUND, 'warn')

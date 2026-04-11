import { createCoreErrorType } from '@/lib/errors.js'

export const ErrorCodes = {
  MAIL_TEMPLATE_NOT_FOUND: 'ERR_MAIL_TEMPLATE_NOT_FOUND',
  MAIL_TEMPLATE_INVALID: 'ERR_MAIL_TEMPLATE_INVALID',
  MAIL_TEMPLATE_RENDER: 'ERR_MAIL_TEMPLATE_RENDER',
  MAIL_TRANSPORT: 'ERR_MAIL_TRANSPORT',
} as const

export const ERR_MAIL_TEMPLATE_NOT_FOUND = createCoreErrorType(
  ErrorCodes.MAIL_TEMPLATE_NOT_FOUND,
  'error'
)

export const ERR_MAIL_TEMPLATE_INVALID = createCoreErrorType(
  ErrorCodes.MAIL_TEMPLATE_INVALID,
  'error'
)

export const ERR_MAIL_TEMPLATE_RENDER = createCoreErrorType(
  ErrorCodes.MAIL_TEMPLATE_RENDER,
  'error'
)

export const ERR_MAIL_TRANSPORT = createCoreErrorType(ErrorCodes.MAIL_TRANSPORT, 'error')

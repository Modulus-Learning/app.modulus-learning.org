import type { Logger } from 'pino'
import { request } from 'undici'

interface RecaptchaResult {
  success: true | false // whether this request was a valid reCAPTCHA token for your site
  score: number // the score for this request (0.0 - 1.0)
  action: string // the action name for this request (important to verify)
  challenge_ts: string // timestamp // timestamp of the challenge load (ISO format yyyy-MM-dd'T'HH:mm:ssZZ)
  hostname: string // the hostname of the site where the reCAPTCHA was solved
}

export class AppError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }

  // Http status code to return if this error is not caught.
  status = 500
  // Application-specific error code to help clients identify this error.
  code = 'ERROR'
}

/**
 * Error for reporting general server errors.
 */
export class HTTP_REQUEST_ERROR extends AppError {
  readonly status = 500
  readonly code = 'HTTP_REQUEST_ERROR'
}

/**
 * Error for reporting general reCAPTCHA errors.
 */
export class RECAPTCHA_VALIDATION_ERROR extends AppError {
  readonly status = 400
  readonly code = 'RECAPTCHA_VALIDATION_ERROR'
}

/**
 * reCaptchaCheck - perform a server-side reCaptcha validation
 * @param secretKey
 * @param token
 * @param log
 * @param score
 * @param ip
 * @param headers
 
 * @returns
 */
export const reCaptchaCheck = async (
  secretKey: string,
  token: string,
  log: Logger,
  score = 0.5,
  ip = '0.0.0.0',
  headers = {}
): Promise<boolean> => {
  const VERIFY_URL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`

  if (process.env.NODE_ENV === 'development') return true

  const { statusCode, body } = await request(VERIFY_URL, { method: 'POST' })
  if (statusCode === 200) {
    const result = (await body.json()) as RecaptchaResult
    if (result.success && result.score >= score) {
      log.info({ recaptcha_result: result, ip, headers })
    } else if (!result.success || result.score < score) {
      log.warn({ recaptcha_result: result, ip, headers })
      throw new RECAPTCHA_VALIDATION_ERROR(`Recaptcha verification failed for ip: ${ip}`)
    }
  } else {
    throw new RECAPTCHA_VALIDATION_ERROR(`Error in HTTP response reCaptchaCheck: ${statusCode}.`)
  }
  return true
}

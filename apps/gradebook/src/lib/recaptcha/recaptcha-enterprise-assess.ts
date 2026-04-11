import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { RecaptchaEnterpriseServiceClient } from '@google-cloud/recaptcha-enterprise'
import { stdSerializers } from 'pino'

import { getServerConfig } from '@/config'
import { getLogger } from '@/lib/logger'

const log = getLogger()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
 * NOTE: Google expects GOOGLE_APPLICATION_CREDENTIALS for service account key
 * material and API communication with whatever Google Cloud services have been
 * configured. The downside is that if our application uses other Google
 * services SDKs that also expect this ENV var, they will all share the same
 * service account key which is currently limited to the Enterprise reCAPTCHA Agent.
 *
 * At the moment we're sharing a single account and key material across our projects
 * for Enterprise reCAPTCHA usage.
 *
 * GOOGLE_APPLICATION_CREDENTIALS may point to a filename and then is converted
 * to an in memory ENV var for local testing.
 *
 * GOOGLE_APPLICATION_CREDENTIALS_JSON is used to retrieve the service account
 * credentials from environment variable directly. This is useful for platforms
 * like Fly.io the entire JSON file can be stored as a secrets and then read
 * directly as an ENV variable.
 *
 * In either case - the required environment variable must be set to
 * GOOGLE_APPLICATION_CREDENTIALS before API calls are made.
 */

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // NOTE: GOOGLE_APPLICATION_CREDENTIALS will point to a filename for credentials
  // stored in the application root (Webapp root, not monorepo root).
  let keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  // Check if the path is not already absolute
  if (!path.isAbsolute(keyFilePath)) {
    // Resolve it relative to the project root (where your app starts or where .env is)
    // A common pattern is to resolve relative to __dirname of your entry file
    keyFilePath = path.resolve(__dirname, `../../../${keyFilePath}`)
    log.info({
      recaptcha: {
        message: `Resolved relative GOOGLE_APPLICATION_CREDENTIALS to absolute: ${keyFilePath}`,
      },
    })
  }

  // Now set the resolved absolute path back to the environment variable
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilePath
  log.info({
    recaptcha: {
      message: `Using GOOGLE_APPLICATION_CREDENTIALS path: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`,
    },
  })
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  // NOTE: GOOGLE_APPLICATION_CREDENTIALS_JSON means the service account JSON is stored
  // directly in the environment variable. It's a large file and so this is less common,
  // but used for example, with Fly.io secrets.
  log.info({
    recaptcha: {
      message:
        'Found JSON credentials in ENV. Writing service account credentials to a temporary file...',
    },
  })
  try {
    // Create a temporary file path
    const tempKeyPath = path.join('/tmp', 'google-sa-key.json') // Use /tmp for ephemeral storage
    fs.writeFileSync(tempKeyPath, process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON, 'utf8')

    // Set the GOOGLE_APPLICATION_CREDENTIALS environment variable
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tempKeyPath
    log.debug({
      recaptcha: {
        message: `GOOGLE_APPLICATION_CREDENTIALS set to: ${tempKeyPath}`,
      },
    })
  } catch (error) {
    log.error({
      recaptcha: {
        message: 'Error writing service account credentials:',
        error: stdSerializers.err(error as Error),
      },
    })
    // NOTE: Exit process if we cannot write the credentials file.
    // TODO: Should we throw instead? It will have the same effect.
    process.exit(1)
  }
} else {
  log.warn({
    recaptcha: {
      message:
        'Neither GOOGLE_APPLICATION_CREDENTIALS nor GOOGLE_APPLICATION_CREDENTIALS_JSON found. Relying on default authentication flow.',
    },
  })
}

/**
 * Create an assessment to analyze the risk of a UI action.
 *
 * projectID: Your Google Cloud Project ID.
 * recaptchaSiteKey: The reCAPTCHA key associated with the site/app
 * token: The generated token obtained from the client.
 * recaptchaAction: Action name corresponding to the token.
 */
async function createAssessment({
  // TODO: Replace the token and reCAPTCHA action variables before running the sample.
  token = 'action-token',
  recaptchaAction = 'action-name',
}) {
  const config = getServerConfig()

  // Create the reCAPTCHA client.
  // TODO: Cache the client generation code (recommended) or call client.close() before exiting the method.
  log.debug({
    recaptcha: {
      message: 'Starting createAssessment',
      action: recaptchaAction,
      score: undefined,
    },
  })

  // Create the client.
  const client = new RecaptchaEnterpriseServiceClient()
  const projectPath = client.projectPath(config.recaptcha.projectID as string)

  log.debug({
    recaptcha: {
      message: `Client and projectPath created: ${projectPath}`,
      action: recaptchaAction,
      score: undefined,
    },
  })

  // Build the assessment request.
  const request = {
    assessment: {
      event: {
        token: token,
        siteKey: config.recaptcha.siteKey as string,
      },
    },
    parent: projectPath,
  }

  const [response] = await client.createAssessment(request)

  log.debug({
    recaptcha: {
      message: 'Received response',
      action: recaptchaAction,
      score: undefined,
      response: response,
    },
  })

  // Check if the token is valid.
  if (response?.tokenProperties?.valid == null || response.tokenProperties.valid === false) {
    log.error({
      recaptcha: {
        message: `The assessment call failed because the token was: ${response?.tokenProperties?.invalidReason}`,
        action: recaptchaAction,
        score: undefined,
        // response: response,
      },
    })
    client.close()
    return null
  }

  // Check if the expected action was executed.
  // The `action` property is set by user client in the grecaptcha.enterprise.execute() method.
  if (response.tokenProperties.action === recaptchaAction) {
    // Get the risk score and the reason(s).
    // For more information on interpreting the assessment, see:
    // https://cloud.google.com/recaptcha-enterprise/docs/interpret-assessment
    log.info({
      recaptcha: {
        message: `The assessment riskAnalysis score is: ${response?.riskAnalysis?.score}`,
        action: recaptchaAction,
        score: response?.riskAnalysis?.score,
        // response: response,
      },
    })

    const reasons = response.riskAnalysis?.reasons || []

    log.debug({
      recaptcha: {
        message: `The assessment riskAnalysis?.reasons are: ${reasons.join(', ')}`,
        action: recaptchaAction,
        score: response?.riskAnalysis?.score,
        reasons,
        // response: response,
      },
    })
    client.close()
    return response?.riskAnalysis?.score
  }
  log.error({
    recaptcha: {
      message:
        'The assessment action attribute in your reCAPTCHA tag does not match the action you are expecting to score.',
      action: recaptchaAction,
      score: undefined,
      // response: response,
    },
  })
  client.close()
  return null
}

export const reCaptchaAssess = async (
  token: string,
  action: string,
  threshold = 0.5,
  ip = '0.0.0.0',
  headers = {}
): Promise<boolean> => {
  log.debug({
    recaptcha: {
      message: 'Starting reCaptchaAssess',
      action,
      score: undefined,
      requiredScore: threshold,
      ip,
      headers,
    },
  })
  const recaptchaScore = await createAssessment({
    token: token,
    recaptchaAction: action,
  })

  if (recaptchaScore == null) {
    log.error({
      recaptcha: {
        message: 'reCaptchaAssess: No score received',
        score: undefined,
        requiredScore: threshold,
        ip,
        headers,
      },
    })
    throw new RECAPTCHA_VALIDATION_ERROR(`Recaptcha verification failed for ip: ${ip}`)
  }
  if (recaptchaScore < threshold) {
    log.error({
      recaptcha: {
        message: 'reCaptchaAssess: Score below required threshold',
        score: recaptchaScore,
        requiredScore: threshold,
        action,
        ip,
        headers,
      },
    })
    throw new RECAPTCHA_VALIDATION_ERROR(
      `Recaptcha verification failed for ip: ${ip}. Score was below ${threshold}`
    )
  }
  log.info({
    recaptcha: {
      message: 'reCaptchaAssess: Recaptcha passed.',
      score: recaptchaScore,
      requiredScore: threshold,
      action,
      ip,
      headers,
    },
  })

  return true
}

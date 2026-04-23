import { type Logger as PinoLogger, pino } from 'pino'

import { type Config, loadConfig, type UrlBuilder } from './config.js'
import { connect } from './database/index.js'
import { DBManagerImpl, TXManagerImpl } from './lib/db-manager.js'
import { DebugMailer, NodeMailer } from './lib/email/services/mailer.js'
import { EmailTemplates } from './lib/email/services/templates.js'
import { JWTSigner, JWTVerifier } from './lib/jwt/services.js'
import { type CoreLogger, createCoreLogger } from './lib/logger.js'
import { AsyncRegistry } from './lib/registry.js'
import { CoreUtils } from './lib/utils.js'
import { createAdminRegistry, getAdminCommands } from './modules/admin/index.js'
import { createAgentRegistry, getAgentCommands } from './modules/agent/index.js'
import { createAppRegistry, getAppCommands } from './modules/app/index.js'
import { LtiKeyStore } from './modules/app/lti/services/keystore.js'
import { startScoreSubmissionWorker } from './workers/score-submission.js'

const createJwtSigner = (deps: { logger: CoreLogger; config: Config }) =>
  JWTSigner.create(deps.logger, deps.config.jwt)

const createJwtVerifier = (deps: { logger: CoreLogger; config: Config }) =>
  JWTVerifier.create({ logger: deps.logger, config: deps.config.jwt })

const createDBPool = (deps: { config: Config }) => connect(deps.config.postgres)

const createEmailTemplates = (deps: { logger: CoreLogger; config: Config }) =>
  new EmailTemplates(deps.logger, deps.config.email.templateDirectory)

const createMailer = (deps: {
  logger: CoreLogger
  config: Config
  emailTemplates: EmailTemplates
}) => {
  if (deps.config.email.debugOnly) {
    return new DebugMailer(deps.logger, deps.emailTemplates)
  }
  return new NodeMailer(deps.logger, deps.config.email, deps.emailTemplates)
}

/**
 * Creates the core registry with all commands, services, and dependencies wired
 * up (but not yet initialized).
 */
const createCoreRegistry = (urlBuilder: UrlBuilder, config: Config) => {
  return new AsyncRegistry()
    .addValue('config', config)
    .addValue('urlBuilder', urlBuilder)
    .addFactory('logger', createCoreLogger)
    .addFactory('jwtSign', createJwtSigner)
    .addFactory('jwtVerify', createJwtVerifier)
    .addAsyncClass('ltiKeyStore', LtiKeyStore)
    .addClass('utils', CoreUtils)
    .addFactory('dbPool', createDBPool)
    .addClass('db', DBManagerImpl)
    .addClass('tx', TXManagerImpl)
    .addFactory('emailTemplates', createEmailTemplates)
    .addFactory('mailer', createMailer)

    .addNested('app', createAppRegistry())
    .addNested('admin', createAdminRegistry())
    .addNested('agent', createAgentRegistry())
}

/**
 * The core commands facade -- the set of method calls that consuming
 * applications are permitted to make into core services.  Each method is a
 * Command, i.e. a function with some associated metadata (see lib/utils.ts).
 */
export type CoreCommands = {
  app: ReturnType<typeof getAppCommands>
  admin: ReturnType<typeof getAdminCommands>
  agent: ReturnType<typeof getAgentCommands>
}

/**
 * A function that can be called to stop a background job or worker loop.
 */
export type StopHandle = () => Promise<void>

/**
 * A fully initialized core instance, providing both the commands facade and a
 * function to start background workers. The registry is internal and not
 * exposed to consumers.
 */
export type CoreInstance = {
  commands: CoreCommands
  startBackgroundJobs: () => StopHandle
}

export type InitOptions = {
  pinoLogger?: PinoLogger
  urlBuilder: UrlBuilder
  config?: Config
}

/**
 * Initializes the core registry and returns a CoreInstance with both
 * the commands facade and a startBackgroundJobs function.
 *
 * In a single-instance deployment, the consuming application should call
 * this once, use `instance.commands` for request handling, and call
 * `instance.startBackgroundJobs()` to start the background worker loops.
 */
export const initCore = async ({
  pinoLogger = pino({ level: 'info' }),
  urlBuilder,
  config = loadConfig(),
}: InitOptions): Promise<CoreInstance> => {
  const registry = await createCoreRegistry(urlBuilder, config).compose({ pinoLogger })

  const commands: CoreCommands = {
    app: getAppCommands(registry.app),
    admin: getAdminCommands(registry.admin),
    agent: getAgentCommands(registry.agent),
  }

  const startBackgroundJobs = (): StopHandle => {
    const stopScoreSubmission = startScoreSubmissionWorker({
      processor: registry.app.lti.scoreSubmissionProcessor,
      logger: registry.logger,
    })

    return async () => {
      // NOTE: this should probably use Promise.all or Promise.allSettled if
      // there are multiple background jobs to stop -- and the question of how
      // (or whether) to handle errors will need to be addressed.
      await stopScoreSubmission()
    }
  }

  return { commands, startBackgroundJobs }
}

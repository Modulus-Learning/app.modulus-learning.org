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
import { createAppRegistry, getAppCommands, getAppWorkers } from './modules/app/index.js'
import { LtiKeyStore } from './modules/app/lti/services/keystore.js'

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

export const initModulusCore = async ({
  pinoLogger = pino({ level: 'info' }),
  urlBuilder,
  config = loadConfig(),
}: {
  pinoLogger?: PinoLogger
  urlBuilder: UrlBuilder
  config?: Config
}) => {
  const registry = await createCoreRegistry(urlBuilder, config).compose({ pinoLogger })

  return {
    app: getAppCommands(registry.app),
    admin: getAdminCommands(registry.admin),
    agent: getAgentCommands(registry.agent),
    workers: {
      ...getAppWorkers(registry.app),
    },
  }
}

export type ModulusCore = Awaited<ReturnType<typeof initModulusCore>>

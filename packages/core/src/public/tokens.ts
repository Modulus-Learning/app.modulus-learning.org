import type { Logger as PinoLogger } from 'pino'
import pino from 'pino'
import { z } from 'zod'

import { JWTVerifier } from '@/lib/jwt/services.js'
import { createCoreLogger } from '@/lib/logger.js'
import { AsyncRegistry, Registry } from '@/lib/registry.js'
import { AdminTokenVerifier } from '@/modules/admin/session/services/token-verifier.js'
import { AgentTokenVerifier } from '@/modules/agent/auth/services/token-verifier.js'
import { TokenVerifier as UserTokenVerifier } from '@/modules/app/session/services/token-verifier.js'

const jwtVerifierConfigSchema = z.object({
  publicKey: z.string().transform((val) => Buffer.from(val, 'base64').toString('utf-8')),
  audience: z.string(),
  issuer: z.string(),
})

export type JWTVerifierConfig = z.infer<typeof jwtVerifierConfigSchema>

const loadRawJwtVerifierConfig = () => {
  return {
    publicKey: process.env.API_JWT_PUBLIC_KEY,
    audience: process.env.API_JWT_AUDIENCE,
    issuer: process.env.API_JWT_ISSUER,
  }
}

export const loadJwtVerifierConfig = () => jwtVerifierConfigSchema.parse(loadRawJwtVerifierConfig())

const createTokenVerifierRegistry = () =>
  new AsyncRegistry()
    .addFactory('logger', createCoreLogger)
    .addAsyncClass('jwtVerify', JWTVerifier)
    .addNested(
      'verifiers',
      new Registry()
        .addClass('user', UserTokenVerifier)
        .addClass('admin', AdminTokenVerifier)
        .addClass('agent', AgentTokenVerifier)
    )

export const initTokenVerifiers = async ({
  pinoLogger = pino({ level: 'info' }),
  config = loadJwtVerifierConfig(),
}: {
  pinoLogger?: PinoLogger
  config?: JWTVerifierConfig
}) => {
  const services = await createTokenVerifierRegistry().compose({ pinoLogger, config })
  return services.verifiers
}

export type TokenVerifiers = Awaited<ReturnType<typeof initTokenVerifiers>>

export type { AccessTokenVerificationResult as AdminAccessTokenVerificationResult } from '@/modules/admin/session/schemas.js'
export type { AccessTokenVerificationResult } from '@/modules/app/session/schemas.js'

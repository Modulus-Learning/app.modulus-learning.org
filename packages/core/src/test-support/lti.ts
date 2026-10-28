import assert from 'node:assert/strict'
import { createServer } from 'node:http'

import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair, type JWK } from 'jose'
import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { createCoreLogger } from '@/lib/logger.js'
import type { PlatformRecord } from '@/modules/app/lti/repository/index.js'

/**
 * Shared support for LTI characterisation tests: a platform key pair served
 * from a local JWKS endpoint, a platform record pointing at it, and a silent
 * core logger. Everything is synthetic; no institutional identifiers.
 */

export const silentLogger = () => createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

export type PlatformKeys = {
  privateKey: CryptoKey
  jwk: JWK
  /** PEM encodings, for config-shaped inputs such as the tool keystore. */
  privatePem: string
  publicPem: string
}

export const createPlatformKeys = async (kid = 'test-key'): Promise<PlatformKeys> => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
  return {
    privateKey,
    jwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' },
    privatePem: await exportPKCS8(privateKey),
    publicPem: await exportSPKI(publicKey),
  }
}

export const startJwksServer = async (jwk: JWK) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ keys: [jwk] }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address != null && typeof address !== 'string')
  return {
    uri: `http://127.0.0.1:${address.port}/jwks`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

export const platformRecord = (
  issuer: string,
  overrides: Partial<PlatformRecord> = {}
): PlatformRecord => ({
  id: uuidv7(),
  issuer,
  name: 'Characterisation Platform',
  client_id: 'characterisation-client',
  authorization_endpoint: `${issuer}/api/lti/authorize_redirect`,
  token_endpoint: `${issuer}/login/oauth2/token`,
  jwks_uri: `${issuer}/api/lti/security/jwks`,
  authorization_server: `${issuer}/login/oauth2/token`,
  ...overrides,
})

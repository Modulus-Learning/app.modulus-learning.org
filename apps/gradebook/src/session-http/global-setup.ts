import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import type { TestProject } from 'vitest/node'

import { envForMode } from '../config/fixtures/mode-env'
import { ADMIN, GRADEBOOK, LEARNER, PLATFORM } from './harness'

/**
 * Boots the built Start server for the session HTTP suite, with:
 * - the synthetic all-in-one fixture environment (throwaway keys, no developer
 *   env file is read), pointed at the disposable test database;
 * - seeded synthetic rows: one learner (with a password), one admin, and one
 *   LTI platform whose JWKS is served by an in-process mock;
 * - jobs disabled.
 *
 * The database comes from TEST_POSTGRES_CONNECTION_STRING, or
 * packages/core/.env.test, and must end in `_test`.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    sessionBaseUrl: string
    jwtPrivateKey: string
    jwtIssuer: string
    jwtAudience: string
    platformPrivateKey: string
  }
}

const CORE = join(GRADEBOOK, '../../packages/core')
const coreRequire = createRequire(join(CORE, 'package.json'))

const testDatabaseUrl = (): string => {
  if (!process.env.TEST_POSTGRES_CONNECTION_STRING && existsSync(join(CORE, '.env.test'))) {
    process.loadEnvFile(join(CORE, '.env.test'))
  }
  const url = process.env.TEST_POSTGRES_CONNECTION_STRING ?? process.env.POSTGRES_CONNECTION_STRING
  if (url == null) throw new Error('session suite: no test database connection string')
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('session suite: refusing a database whose name does not end in _test')
  }
  return url
}

const freePort = () =>
  new Promise<number>((resolvePort) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolvePort(port))
    })
  })

const seed = async (databaseUrl: string, platformBase: string) => {
  // core's own dependencies, typed only as far as the seed uses them
  const { Client } = coreRequire('pg') as {
    Client: new (options: {
      connectionString: string
    }) => {
      connect(): Promise<void>
      query(text: string, values?: unknown[]): Promise<unknown>
      end(): Promise<void>
    }
  }
  const argon2 = coreRequire('argon2') as { hash: (password: string) => Promise<string> }
  const db = new Client({ connectionString: databaseUrl })
  await db.connect()
  try {
    // The standard roles LTI and OAuth sign-in attach (core's `06_roles` seed),
    // added only when absent: the integration suite truncates them.
    for (const [name, machineName] of [
      ['Everyone', 'everyone'],
      ['Instructor', 'instructor'],
      ['Learner', 'learner'],
    ]) {
      await db.query(
        `INSERT INTO roles (id, name, machine_name)
         SELECT uuidv7(), $1::varchar, $2::varchar
         WHERE NOT EXISTS (SELECT 1 FROM roles WHERE machine_name = $2::varchar)`,
        [name, machineName]
      )
    }
    await db.query('DELETE FROM lti_platform_deployments WHERE platform_issuer = $1', [
      PLATFORM.issuer,
    ])
    await db.query('DELETE FROM lti_platforms WHERE issuer = $1', [PLATFORM.issuer])
    await db.query('DELETE FROM users WHERE id = $1 OR email = $2', [LEARNER.id, LEARNER.email])
    await db.query('DELETE FROM admin_users WHERE id = $1 OR email = $2', [ADMIN.id, ADMIN.email])
    await db.query(
      `INSERT INTO users (id, email, full_name, password, is_enabled, is_email_verified, agreed_to_terms)
       VALUES ($1, $2, $3, $4, true, true, true)`,
      [LEARNER.id, LEARNER.email, LEARNER.fullName, await argon2.hash(LEARNER.password)]
    )
    await db.query(
      `INSERT INTO admin_users (id, email, given_name, family_name, is_enabled, is_email_verified)
       VALUES ($1, $2, $3, $4, true, true)`,
      [ADMIN.id, ADMIN.email, ADMIN.givenName, ADMIN.familyName]
    )
    await db.query(
      `INSERT INTO lti_platforms (id, issuer, name, client_id, authorization_endpoint, token_endpoint, jwks_uri, authorization_server)
       VALUES ('01900000-0000-7000-8000-00000000a003', $1, 'Session Test Platform', $2, $3, $4, $5, $6)`,
      [
        PLATFORM.issuer,
        PLATFORM.clientId,
        `${platformBase}/auth`,
        `${platformBase}/token`,
        `${platformBase}/jwks`,
        platformBase,
      ]
    )
  } finally {
    await db.end()
  }
}

const waitForServer = async (url: string, server: ChildProcess) => {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode != null)
      throw new Error(`session suite: server exited (${server.exitCode})`)
    try {
      if ((await fetch(`${url}/routes/elb-status`)).ok) return
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error('session suite: server did not become ready')
}

export default async function setup(project: TestProject) {
  if (!existsSync(join(GRADEBOOK, '.output/server/index.mjs'))) {
    throw new Error('session suite: build first (pnpm build:start)')
  }

  // Mock LTI platform: only the JWKS endpoint is fetched by the server.
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = { ...(await exportJWK(publicKey)), kid: PLATFORM.kid, alg: 'RS256', use: 'sig' }
  const platformServer: Server = createServer((req, res) => {
    if (req.url === '/jwks') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [jwk] }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((done) => platformServer.listen(0, '127.0.0.1', done))
  const platformBase = `http://127.0.0.1:${(platformServer.address() as AddressInfo).port}`

  const closePlatform = () => new Promise((done) => platformServer.close(done))
  const databaseUrl = testDatabaseUrl()
  try {
    await seed(databaseUrl, platformBase)
  } catch (error) {
    await closePlatform()
    throw error
  }

  const port = await freePort()
  const env: Record<string, string> = {
    ...envForMode('all-in-one'),
    POSTGRES_CONNECTION_STRING: databaseUrl,
    PORT: String(port),
    HOST: '127.0.0.1',
    JOB_QUEUE_ENABLED: 'false',
    // CSP on, so the suite also proves the supported CSP configuration (R4).
    VITE_CSP_ENABLED: 'true',
    LOG_LEVEL: 'warn',
    NODE_ENV: 'production',
    PATH: process.env.PATH ?? '',
  }
  const server: ChildProcess = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: GRADEBOOK,
    env: env as NodeJS.ProcessEnv,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  const baseUrl = `http://127.0.0.1:${port}`
  try {
    await waitForServer(baseUrl, server)
  } catch (error) {
    server.kill('SIGTERM')
    await closePlatform()
    throw error
  }

  project.provide('sessionBaseUrl', baseUrl)
  project.provide('jwtPrivateKey', env.API_JWT_PRIVATE_KEY as string)
  project.provide('jwtIssuer', env.API_JWT_ISSUER as string)
  project.provide('jwtAudience', env.API_JWT_AUDIENCE as string)
  project.provide('platformPrivateKey', await exportPKCS8(privateKey))

  return async () => {
    server.kill('SIGTERM')
    await new Promise((done) => server.once('exit', done))
    await closePlatform()
  }
}

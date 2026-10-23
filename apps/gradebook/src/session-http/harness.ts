import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { importPKCS8, SignJWT } from 'jose'
import { inject } from 'vitest'

/**
 * Shared helpers for the session HTTP suite (`pnpm test:session`). The suite
 * drives the BUILT Start server (`.output`) over HTTP with synthetic identities
 * only: the fixture environment's throwaway keys, seeded rows in the
 * disposable `*_test` database, and an in-process mock LTI platform. See
 * `global-setup.ts`.
 */

export const GRADEBOOK = resolve(import.meta.dirname, '../..')
export const OUTPUT_SERVER = join(GRADEBOOK, '.output/server')

export const LEARNER = {
  id: '01900000-0000-7000-8000-00000000a001',
  email: 'learner@session.test',
  fullName: 'Synthetic Learner',
  password: 'Synthetic-Learner-1',
}
export const ADMIN = {
  id: '01900000-0000-7000-8000-00000000a002',
  email: 'admin@session.test',
  givenName: 'Synthetic',
  familyName: 'Admin',
  password: 'Synthetic-Admin-1',
}
export const PLATFORM = {
  issuer: 'https://platform.session.test',
  clientId: 'session-client',
  deploymentId: 'session-deployment',
  kid: 'session-key',
}

export const baseUrl = () => inject('sessionBaseUrl')

/** GET/POST against the server under test, never following redirects. */
export const request = (path: string, init: RequestInit = {}) =>
  fetch(`${baseUrl()}${path}`, { redirect: 'manual', ...init })

/** Every `Set-Cookie` header, raw and unmerged. */
export const rawSetCookies = (response: Response) => response.headers.getSetCookie()

/** One cookie's raw header, by name. */
export const setCookieNamed = (response: Response, name: string) =>
  rawSetCookies(response).find((header) => header.startsWith(`${name}=`))

/** The attributes of a raw `Set-Cookie` header, lower-cased, value excluded. */
export const cookieAttributes = (header: string) =>
  header
    .split(';')
    .slice(1)
    .map((part) => part.trim().toLowerCase())

export const cookieValue = (header: string) => header.slice(header.indexOf('=') + 1).split(';')[0]

// What core's role tables grant a learner/instructor and a full admin.
export const LEARNER_ABILITIES = [
  'access_dashboard',
  'account:read_own',
  'account:edit_own',
  'activity_codes:list_own',
  'activity_codes:read_own',
  'activity_codes:create_own',
  'activity_codes:update_own',
  'activity_codes:delete_own',
]
export const ADMIN_ABILITIES = [
  'access_admin',
  'account:read_own',
  'account:edit_own',
  'reports:read',
  'users:list',
  'users:read',
  'users:create',
  'users:edit',
  'users:delete',
  'roles:list',
  'roles:read',
  'roles:create',
  'roles:edit',
  'roles:delete',
]

const fixtureKey = () =>
  importPKCS8(Buffer.from(inject('jwtPrivateKey'), 'base64').toString(), 'RS256')

/** A session access token signed with the fixture key, as core would mint one. */
export const accessToken = async (
  payload: Record<string, unknown>,
  expiresIn: string | number = '5m'
) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setAudience(inject('jwtAudience'))
    .setIssuer(inject('jwtIssuer'))
    .sign(await fixtureKey())

export const learnerToken = (expiresIn?: string | number) =>
  accessToken(
    {
      user: { id: LEARNER.id, full_name: LEARNER.fullName },
      abilities: LEARNER_ABILITIES,
    },
    expiresIn
  )

export const adminToken = (expiresIn?: string | number) =>
  accessToken(
    {
      user: {
        id: ADMIN.id,
        given_name: ADMIN.givenName,
        family_name: ADMIN.familyName,
        email: ADMIN.email,
      },
      abilities: ADMIN_ABILITIES,
      provider: 'admin_session',
    },
    expiresIn
  )

/**
 * A server function's opaque id, read from the built server bundle by the
 * variable Start generates for it (`<name>_createServerFn_handler`). Throws if
 * the name is missing or ambiguous, so a renamed function fails loudly.
 */
export const serverFnId = (name: string): string => {
  const pattern = new RegExp(
    `var ${name}_createServerFn_handler = createServerRpc\\(\\{\\s*id: "([0-9a-f]+)"`,
    'g'
  )
  const ids = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.mjs')) {
        for (const match of readFileSync(path, 'utf8').matchAll(pattern))
          ids.add(match[1] as string)
      }
    }
  }
  walk(OUTPUT_SERVER)
  if (ids.size !== 1) throw new Error(`server function ${name}: ${ids.size} ids in the build`)
  return [...ids][0] as string
}

// Start's client serialises `{ data, context }` with seroval; so do we.
const require = createRequire(join(GRADEBOOK, 'package.json'))
const seroval = createRequire(require.resolve('@tanstack/react-start/package.json'))('seroval') as {
  toJSONAsync: (value: unknown) => Promise<unknown>
}

const serialise = async (payload: Record<string, unknown>) =>
  JSON.stringify(await seroval.toJSONAsync(payload))

const serverFnHeaders = (cookie?: string) => {
  const headers = new Headers({ 'x-tsr-serverFn': 'true', 'sec-fetch-site': 'same-origin' })
  if (cookie) headers.set('cookie', cookie)
  return headers
}

/** Calls a GET server function the way the Start client does. */
export const callGetFn = async (
  name: string,
  payload: { data?: unknown; context?: Record<string, unknown> },
  cookie?: string
) => {
  const query = new URLSearchParams({ payload: await serialise(payload) })
  return request(`/_serverFn/${serverFnId(name)}?${query}`, { headers: serverFnHeaders(cookie) })
}

/** Calls a POST server function with a JSON payload. */
export const callPostFn = async (
  name: string,
  payload: { data?: unknown; context?: Record<string, unknown> },
  cookie?: string
) => {
  const headers = serverFnHeaders(cookie)
  headers.set('content-type', 'application/json')
  return request(`/_serverFn/${serverFnId(name)}`, {
    method: 'POST',
    headers,
    body: await serialise(payload),
  })
}

/** Calls a POST server function with a FormData payload (context as a form field). */
export const callFormFn = async (
  name: string,
  form: FormData,
  context: Record<string, unknown> | undefined,
  cookie?: string
) => {
  if (context) form.set('__TSS_CONTEXT', await serialise(context))
  return request(`/_serverFn/${serverFnId(name)}`, {
    method: 'POST',
    headers: serverFnHeaders(cookie),
    body: form,
  })
}

export const BOUNDARY_HEADER = 'x-modulus-auth-boundary'

/** A real password sign-in for the seeded learner; returns the issued pair. */
export const signInLearner = async () => {
  const form = new FormData()
  form.set('email', LEARNER.email)
  form.set('password', LEARNER.password)
  form.set('callback_url', '')
  const response = await callFormFn('signInUserFn', form, undefined)
  const session = setCookieNamed(response, 'user_session')
  const refresh = setCookieNamed(response, 'user_refresh')
  if (session == null || refresh == null) throw new Error('signInLearner: no cookie pair')
  return { response, session: cookieValue(session), refresh: cookieValue(refresh) }
}

/** An access-token `exp` one minute in the past. */
export const expiredAt = () => Math.floor(Date.now() / 1000) - 60

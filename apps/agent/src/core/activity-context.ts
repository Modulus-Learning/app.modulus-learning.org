export const DEFAULT_SCOPE_ID = '00000000-0000-0000-0000-000000000000'

export const TAB_CONTEXT_STORAGE_KEY = 'modulus_activity_context'
export const OAUTH_SESSION_STORAGE_KEY = 'modulus_oauth_session'

export type StoredActivityContext = {
  version: 1
  issuer: string
  scope_id: string
  scope_name?: string
}

export type StoredReturnLocation = {
  search: string
  hash: string
}

export type StoredOAuthSession = {
  version: 1
  state: string
  code_verifier: string
  context: StoredActivityContext
  return_location: StoredReturnLocation
}

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

const isValidIssuer = (value: unknown): value is string => {
  if (typeof value !== 'string') return false

  try {
    const issuer = new URL(value)
    return (
      (issuer.protocol === 'https:' || issuer.protocol === 'http:') &&
      issuer.username === '' &&
      issuer.password === ''
    )
  } catch {
    return false
  }
}

export const createActivityContext = (
  issuer: unknown,
  scope_id: unknown,
  scope_name?: unknown
): StoredActivityContext | null => {
  if (!isValidIssuer(issuer) || typeof scope_id !== 'string' || !UUID_PATTERN.test(scope_id)) {
    return null
  }

  return {
    version: 1,
    issuer,
    scope_id: scope_id.toLowerCase(),
    ...(typeof scope_name === 'string' && scope_name.length > 0 ? { scope_name } : {}),
  }
}

export const parseActivityContext = (value: unknown): StoredActivityContext | null => {
  if (value == null || typeof value !== 'object') return null

  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1) return null
  return createActivityContext(candidate.issuer, candidate.scope_id, candidate.scope_name)
}

const parseReturnLocation = (value: unknown): StoredReturnLocation | null => {
  if (value == null || typeof value !== 'object') return null

  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.search !== 'string' ||
    (candidate.search !== '' && !candidate.search.startsWith('?')) ||
    typeof candidate.hash !== 'string' ||
    (candidate.hash !== '' && !candidate.hash.startsWith('#'))
  ) {
    return null
  }

  return { search: candidate.search, hash: candidate.hash }
}

export const parseOAuthSession = (value: unknown): StoredOAuthSession | null => {
  if (value == null || typeof value !== 'object') return null

  const candidate = value as Record<string, unknown>
  const context = parseActivityContext(candidate.context)
  const return_location = parseReturnLocation(candidate.return_location)
  if (
    candidate.version !== 1 ||
    typeof candidate.state !== 'string' ||
    candidate.state.length === 0 ||
    typeof candidate.code_verifier !== 'string' ||
    candidate.code_verifier.length === 0 ||
    context == null ||
    return_location == null
  ) {
    return null
  }

  return {
    version: 1,
    state: candidate.state,
    code_verifier: candidate.code_verifier,
    context,
    return_location,
  }
}

const readJson = <T>(
  storage: Storage,
  key: string,
  parse: (value: unknown) => T | null
): T | null => {
  let serialized: string | null
  try {
    serialized = storage.getItem(key)
  } catch {
    return null
  }
  if (serialized == null) return null

  try {
    const parsed = parse(JSON.parse(serialized))
    if (parsed != null) return parsed
  } catch {
    // Invalid records are removed below.
  }

  removeStoredValue(storage, key)
  return null
}

const writeJson = (storage: Storage, key: string, value: unknown): boolean => {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export const removeStoredValue = (storage: Storage, key: string): void => {
  try {
    storage.removeItem(key)
  } catch {
    // Storage availability is best-effort; local activity behavior must survive.
  }
}

export const readTabContext = (): StoredActivityContext | null =>
  readJson(window.sessionStorage, TAB_CONTEXT_STORAGE_KEY, parseActivityContext)

export const writeTabContext = (context: StoredActivityContext): boolean =>
  writeJson(window.sessionStorage, TAB_CONTEXT_STORAGE_KEY, context)

export const readOAuthSession = (): StoredOAuthSession | null =>
  readJson(window.sessionStorage, OAUTH_SESSION_STORAGE_KEY, parseOAuthSession)

export const writeOAuthSession = (session: StoredOAuthSession): boolean =>
  writeJson(window.sessionStorage, OAUTH_SESSION_STORAGE_KEY, session)

export const clearOAuthSession = (): void =>
  removeStoredValue(window.sessionStorage, OAUTH_SESSION_STORAGE_KEY)

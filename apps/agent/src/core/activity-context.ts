import type { Logger } from './logger.js'

// This value intentionally mirrors packages/core/src/database/schema/constants.ts.
// The published browser agent cannot depend on the private core package.
export const DEFAULT_SCOPE_ID = '00000000-0000-0000-0000-000000000000'

export const TAB_CONTEXT_STORAGE_KEY = 'modulus_activity_context'
export const SHARED_CONTEXT_STORAGE_KEY = 'modulus_foreground_activity_context'
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

export type SharedContextSnapshot = {
  serialized: string
  context: StoredActivityContext | null
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

const getStorage = (kind: 'localStorage' | 'sessionStorage'): Storage | null => {
  try {
    return window[kind]
  } catch {
    return null
  }
}

const readStoredValue = (storage: Storage | null, key: string): string | null => {
  if (storage == null) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

const readJson = <T>(
  storage: Storage | null,
  key: string,
  parse: (value: unknown) => T | null
): T | null => {
  const serialized = readStoredValue(storage, key)
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

const writeJson = (storage: Storage | null, key: string, value: unknown): boolean => {
  if (storage == null) return false
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

const removeStoredValue = (storage: Storage | null, key: string): void => {
  if (storage == null) return
  try {
    storage.removeItem(key)
  } catch {
    // Storage availability is best-effort; local activity behavior must survive.
  }
}

export const readTabContext = (): StoredActivityContext | null =>
  readJson(getStorage('sessionStorage'), TAB_CONTEXT_STORAGE_KEY, parseActivityContext)

export const writeTabContext = (context: StoredActivityContext): boolean =>
  writeJson(getStorage('sessionStorage'), TAB_CONTEXT_STORAGE_KEY, context)

export const clearTabContext = (): void =>
  removeStoredValue(getStorage('sessionStorage'), TAB_CONTEXT_STORAGE_KEY)

export const readOAuthSession = (): StoredOAuthSession | null =>
  readJson(getStorage('sessionStorage'), OAUTH_SESSION_STORAGE_KEY, parseOAuthSession)

export const writeOAuthSession = (session: StoredOAuthSession): boolean =>
  writeJson(getStorage('sessionStorage'), OAUTH_SESSION_STORAGE_KEY, session)

export const clearOAuthSession = (): void =>
  removeStoredValue(getStorage('sessionStorage'), OAUTH_SESSION_STORAGE_KEY)

export const removeLegacyIssuerContext = (): void =>
  removeStoredValue(getStorage('localStorage'), 'modulus_base_url')

export const readSharedContextSnapshot = (): SharedContextSnapshot | null => {
  const serialized = readStoredValue(getStorage('localStorage'), SHARED_CONTEXT_STORAGE_KEY)
  if (serialized == null) return null

  try {
    return {
      serialized,
      context: parseActivityContext(JSON.parse(serialized)),
    }
  } catch {
    return { serialized, context: null }
  }
}

export const readSharedContext = (): StoredActivityContext | null =>
  readSharedContextSnapshot()?.context ?? null

export const sameActivityContextIdentity = (
  left: StoredActivityContext,
  right: StoredActivityContext
): boolean => left.issuer === right.issuer && left.scope_id === right.scope_id

const isForegroundOwner = (): boolean => {
  try {
    return document.visibilityState === 'visible' && document.hasFocus()
  } catch {
    return false
  }
}

export const publishTabContextIfForeground = async (
  logger: Logger | undefined
): Promise<boolean> => {
  if (!isForegroundOwner()) return false

  const tabContext = readTabContext()
  if (tabContext == null) return false

  const shared = readSharedContextSnapshot()
  const diverged =
    shared?.context != null && !sameActivityContextIdentity(tabContext, shared.context)
  const published = writeJson(getStorage('localStorage'), SHARED_CONTEXT_STORAGE_KEY, tabContext)
  if (diverged) {
    await logger?.log('Tab and shared activity contexts diverged before foreground publication', {
      tab_scope_id: tabContext.scope_id,
      shared_scope_id: shared.context?.scope_id,
      issuer_changed: tabContext.issuer !== shared.context?.issuer,
    })
  }

  if (!published) {
    await logger?.log('Unable to publish foreground activity context')
  }
  return published
}

export const deleteSharedContextIfForeground = async (
  snapshot: SharedContextSnapshot,
  logger: Logger | undefined
): Promise<boolean> => {
  if (!isForegroundOwner()) return false

  const storage = getStorage('localStorage')
  if (
    storage == null ||
    readStoredValue(storage, SHARED_CONTEXT_STORAGE_KEY) !== snapshot.serialized
  ) {
    return false
  }

  try {
    storage.removeItem(SHARED_CONTEXT_STORAGE_KEY)
    await logger?.log('Deleted definitively invalid shared activity context')
    return true
  } catch {
    await logger?.log('Unable to delete invalid shared activity context')
    return false
  }
}

let publicationListenersInstalled = false
let publicationLogger: Logger | undefined

const publishFromForegroundEvent = (): void => {
  void publishTabContextIfForeground(publicationLogger)
}

export const installForegroundContextPublication = (logger: Logger | undefined): void => {
  publicationLogger = logger
  if (publicationListenersInstalled) return

  document.addEventListener('visibilitychange', publishFromForegroundEvent)
  window.addEventListener('focus', publishFromForegroundEvent)
  publicationListenersInstalled = true
}

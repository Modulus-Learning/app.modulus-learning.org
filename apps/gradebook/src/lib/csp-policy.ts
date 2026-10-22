import { getCSPHeaderRelaxed, getCSPHeaderStrict } from '@/config'

// Top-level segments (after an optional locale) whose pages take the strict,
// nonce-based policy; everything else takes the relaxed one. Mirrors the Next
// `withCSP` layer so both hosts emit the same header for the same path.
const STRICT_SEGMENTS = ['sign-in', 'sign-up', 'start-activity', 'account', 'dashboard', 'admin']

const STRICT_PATH = new RegExp(`^(\\/[a-zA-Z]{2})?\\/(${STRICT_SEGMENTS.join('|')})(\\/.*)?\\/?$`)

export const isStrictCspPath = (pathname: string): boolean => STRICT_PATH.test(pathname)

export const cspHeaderFor = (pathname: string, nonce: string): string =>
  isStrictCspPath(pathname) ? getCSPHeaderStrict(nonce) : getCSPHeaderRelaxed()

export const generateNonce = (): string => Buffer.from(crypto.randomUUID()).toString('base64')

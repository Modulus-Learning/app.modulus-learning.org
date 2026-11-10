import { getCSPHeaderRelaxed, getCSPHeaderStrict } from '@/config'

// Top-level segments (after an optional locale) whose pages take the strict,
// nonce-based policy; everything else takes the relaxed one. Mirrors the Next
// `withCSP` layer so both hosts emit the same header for the same path.
const STRICT_SEGMENTS = ['sign-in', 'sign-up', 'start-activity', 'account', 'dashboard', 'admin']

const STRICT_PATH = new RegExp(`^(\\/[a-zA-Z]{2})?\\/(${STRICT_SEGMENTS.join('|')})(\\/.*)?\\/?$`)

export const isStrictCspPath = (pathname: string): boolean => STRICT_PATH.test(pathname)

// Pages an LMS frames: the chromeless LTI and agent pages, and the learner
// session bootstrap that runs inside the same iframe. Both policies forbid
// framing (`frame-ancestors 'none'`) and LMS form targets (`form-action
// 'self'`), so these pages get no policy at all — as the Next proxy matcher
// excluded `/lti` and `/agent` from its CSP layer.
const FRAMED_PATH = /^\/(lti|agent)(\/.*)?$|^\/auth\/renew\/?$/

export const isFramedPath = (pathname: string): boolean => FRAMED_PATH.test(pathname)

/** The page's CSP header, or null for a framed page that must carry none. */
export const cspHeaderFor = (pathname: string, nonce: string): string | null => {
  if (isFramedPath(pathname)) return null
  return isStrictCspPath(pathname) ? getCSPHeaderStrict(nonce) : getCSPHeaderRelaxed()
}

export const generateNonce = (): string => Buffer.from(crypto.randomUUID()).toString('base64')

// https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy

import { getCSPHeaderRelaxed, getCSPHeaderStrict, getServerConfig } from '@/config'
import type { ProxyLayer } from './@types'

// Top-level path segments whose routes require the strict, nonce-based CSP:
// (forms), (auth) and (admin) route groups. Anything else -- including the
// locale root '/en' and the (public) catch-all [...notfound] -- falls through
// to the relaxed policy.
const strictPaths = ['sign-in', 'sign-up', 'start-activity', 'account', 'dashboard', 'admin']

const strictPathMatcher = new RegExp(
  `^(\\/[a-zA-Z]{2})?\\/(${strictPaths.join('|')})(\\/.*)?\\/?$`,
)

function isStrictRoute(pathname: string) {
  return strictPathMatcher.test(pathname)
}

export const withCSP: ProxyLayer = (next) => {
  const config = getServerConfig()

  return async (request, event, context) => {
    if (config.cspEnabled && request.headers.get('x-nonce') != null) {
      const nonce = request.headers.get('x-nonce')!
      const cspHeader = isStrictRoute(request.nextUrl.pathname)
        ? getCSPHeaderStrict(nonce)
        : getCSPHeaderRelaxed()
      // TODO: Should this be set on the request?
      request.headers.set('Content-Security-Policy', cspHeader)
      const response = await next(request, event, context)
      response.headers.set('Content-Security-Policy', cspHeader)
      return response
    }
    return next(request, event, context)
  }
}

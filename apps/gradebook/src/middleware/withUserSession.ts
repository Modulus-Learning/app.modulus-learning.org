import { getServerConfig } from '@/config'
import {
  readUserSession,
  refreshCookieOptions,
  sessionCookieOptions,
} from '@/modules/app/session/storage'
import type { ProxyLayer } from './@types'

// Proxy layer for validating the current session (as represented by an access /
// refresh token pair, sent in the request's cookies).  Will perform a token
// refresh if the access token is expired (or almost-expired). If the tokens get
// refreshed, this layer ensures that the corresponding cookies are updated in
// both the request (so that later proxy layers, pages, server actions etc see
// the updated cookies) and the response (so that the updated cookies are sent
// back to the client).  This also stores the session data (if valid) in the
// proxy context object, so that later proxy layers can access it.
export const withUserSession: ProxyLayer = (next) => {
  return async (request, event, context) => {
    const { status, payload: session, expires_at_ms } = await readUserSession(request)

    // If the token is valid, and not about to expire, store the session in
    // context (for later proxy layers) and continue to the next proxy layer.
    // However, if the token will expire within 10 seconds (TODO: make this
    // interval configurable), continue below to proactively refresh the
    // session.
    if (status === 'valid' && expires_at_ms > Date.now() + 10 * 1000) {
      context.userSession = session
      return next(request, event, context)
    }

    const config = getServerConfig()
    const refreshToken = request.cookies.get(config.cookies.userRefresh.name)?.value

    if (refreshToken) {
      try {
        // TODO: Should we also validate the token before sending off the refresh request?
        // TODO: Should this be GET or POST, and should it use an Authorization
        // header or just a JSON request body?
        // TODO: Should we ever retry this request if it fails?
        const response = await fetch(`${config.publicServerUrl}/routes/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refreshToken,
          }),
        })

        if (response.ok) {
          // TODO: Validate response body?
          const { status, result } = await response.json()

          if (status === 'success') {
            const { tokens, session } = result

            // Token refresh succeeded.  Store the new session data in context
            // (for later proxy layers), and update both the request and response
            // cookies to include the new access and refresh tokens.
            context.userSession = session
            request.cookies.set(config.cookies.userSession.name, tokens.access.token)
            request.cookies.set(config.cookies.userRefresh.name, tokens.refresh.token)

            const response = await next(request, event, context)

            response.cookies.set(
              config.cookies.userSession.name,
              tokens.access.token,
              sessionCookieOptions(tokens.access.expiration_in_ms)
            )

            response.cookies.set(
              config.cookies.userRefresh.name,
              tokens.refresh.token,
              refreshCookieOptions(tokens.refresh.expiration_in_ms, tokens.remember_me)
            )

            return response
          }

          // If we're here, then response.ok was true but status was not
          // 'success', which should be impossible.
          // TODO: Log?  For now, just fall through.
        }

        //Token refresh returned an http error status.  We could extract some
        // data from the response and log it or otherwise deal with it.
        // TODO: Log?  For now, just fall through.
      } catch (_) {
        // Encountered a network error or perhaps a non-json response body.
        // TODO: Log!  For now, just fall through.
      }
    }

    // Access token was not valid, and refresh failed as well.  Clear the
    // cookies and move on.

    // TODO: We should not delete cookies in all cases here -- only when the
    // refresh failed because the session is no longer valid, but not on other
    // errors.
    const hasSessionCookie = request.cookies.has(config.cookies.userSession.name)
    const hasRefreshCookie = request.cookies.has(config.cookies.userRefresh.name)
    if (hasSessionCookie) request.cookies.delete(config.cookies.userSession.name)
    if (hasRefreshCookie) request.cookies.delete(config.cookies.userRefresh.name)
    const response = await next(request, event, context)
    if (hasSessionCookie) response.cookies.delete(config.cookies.userSession.name)
    if (hasRefreshCookie) response.cookies.delete(config.cookies.userRefresh.name)
    return response
  }
}

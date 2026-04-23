// import { cookies, headers } from 'next/headers'
// import type { NextRequest } from 'next/server'

// import { jwtVerify } from '@infonomic/crypto'
// import { decodeJwt } from 'jose'
// import { JWTExpired } from 'jose/errors'

// import { getServerConfig } from '@/config'
// import { getCoreCommands } from '@/modulus-core'
// import { accessTokenSchema, refreshTokenSchema } from './@types'
// import { refreshCookieOptions, sessionCookieOptions } from './cookies'
// import type { AccessTokenPayload, Provider } from './@types'

// export const SESSION_VALID_HEADER = 'X-MODULUS-ADMIN-SESSION-VALID'

// /**
//  * getSessionCookie
//  *
//  * Returns the current (validated, possibly refreshed) session cookie / access
//  * token.  Checks that the session was already successfully validated by the
//  * withValidatedSession middleware, and returns undefined if not.  Can be called
//  * in middleware _after_ the withValidatedSession middleware (by passing in the
//  * NextRequest object), or in any page / server action / route handler (leave
//  * request undefined)
//  *
//  * @param request
//  * @returns
//  */
// export const getSessionCookie = async (
//   request?: NextRequest | undefined | null,
//   validate = true
// ): Promise<string | undefined> => {
//   const config = getServerConfig()
//   const headerSet = request ? request.headers : await headers()

//   if (validate === true) {
//     const sessionValid = headerSet.get(SESSION_VALID_HEADER)
//     if (sessionValid !== 'true') {
//       return undefined
//     }
//   }

//   const cookieStore = request ? request.cookies : await cookies()

//   return cookieStore.get(config.cookies.adminSession.name)?.value
// }

// /**
//  * setSessionCookies
//  *
//  * Helper to set the session cookies (the access and refresh tokens).  Should
//  *  _only_ be called in a server action or route handler (after signing in a
//  * user, for example)
//  *
//  * @param param0
//  */
// export const setSessionCookies = async ({
//   access_token,
//   refresh_token,
//   remember_me,
// }: {
//   access_token: string
//   refresh_token: string
//   remember_me: boolean
// }) => {
//   const config = getServerConfig()
//   const cookieStore = await cookies()
//   cookieStore.set(config.cookies.adminSession.name, access_token, sessionCookieOptions())
//   cookieStore.set(
//     config.cookies.adminRefresh.name,
//     refresh_token,
//     refreshCookieOptions(remember_me)
//   )
// }

// /**
//  * deleteSessionCookies
//  *
//  * Helper to delete the session cookies (the access and refresh tokens).  Should
//  *_only_ be called in a server action or route handler (after signing out a user,
//  * for example)
//  */
// export const deleteSessionCookies = async () => {
//   const config = getServerConfig()
//   const cookieStore = await cookies()
//   cookieStore.delete(config.cookies.adminSession.name)
//   cookieStore.delete(config.cookies.adminRefresh.name)
// }

// /**
//  * getSession
//  *
//  * Returns the current (validated and possibly refreshed) session. Same rules as
//  *  getSessionCookie: can be called in any page, server action, or route handler
//  * (leave request undefined), or in middleware after withValidatedSession (pass
//  * in the NextRequest object).
//  *
//  * @param request
//  * @returns
//  */
// export const getSession = async (
//   request?: NextRequest | undefined | null,
//   validate = true
// ): Promise<AccessTokenPayload | undefined> => {
//   const access_token = await getSessionCookie(request, validate)
//   if (access_token == null) {
//     return undefined
//   }

//   // TODO: Should we use jwtVerify or verifyAccessToken instead?  In the current
//   // implementation, getSessionCookie returns undefined _unless_ the
//   // withValidatedSession middleware set the 'X-MODULUS-SESSION-VALID' header,
//   // which is read by getSessionCookie.  In other words, if access_token is not
//   // undefined, then we _know_ the access token is valid, and so don't need to
//   // re-validate it.

//   // TODO: Should we pass through zod schema as well?
//   return decodeJwt(access_token)
// }

// /**
//  * verifySessionWithRefresh
//  *
//  * Verifies the session for the given request, performing a token refresh if
//  * needed.  Intended for use in the withValidatedSession middleware -- should
//  * not be called elsewhere.
//  *
//  * @param request
//  * @returns
//  */
// export const verifySessionWithRefresh = async (
//   request: NextRequest
// ): Promise<{
//   valid: boolean
//   setCookies?: { session: string; refresh: string; remember_me: boolean } | undefined
//   deleteCookies?: boolean | undefined
// }> => {
//   const config = getServerConfig()
//   // Check for refresh cookie / token.  Session cookie / access token is allowed
//   // to be null (the cookie may have expired) but refresh cookie should be
//   // present and valid.  If it's missing or invalid, treat the user as not-logged-in,
//   // and take no further action.
//   const refresh_token = request.cookies.get(config.cookies.adminRefresh.name)?.value
//   const { status: refreshTokenStatus, provider: refreshTokenProvider } =
//     await verifyRefreshToken(refresh_token)
//   if (refresh_token == null || refreshTokenStatus === 'invalid') {
//     return {
//       valid: false,
//     }
//   }

//   const { status: accessTokenStatus } = await verifyAccessToken(
//     request.cookies.get(config.cookies.adminSession.name)?.value
//   )

//   if (accessTokenStatus === 'valid') {
//     // We got a valid, unexpired session.  No cookies to set or delete
//     return {
//       valid: true,
//     }
//   }
//   if (accessTokenStatus === 'expired') {
//     // Attempt a refresh
//     const refreshResult = await refreshTokens(refresh_token, refreshTokenProvider)
//     if (refreshResult != null) {
//       const { access_token, refresh_token, remember_me } = refreshResult
//       const { status: accessTokenStatus } = await verifyAccessToken(access_token)
//       if (accessTokenStatus === 'valid') {
//         // Refresh succeeded, and the resulting session is valid.
//         // TODO: Encrypt refresh token
//         return {
//           valid: true,
//           setCookies: { session: access_token, refresh: refresh_token, remember_me },
//         }
//       }
//     }
//   }

//   // If we're here, we never got a valid session.  Cookies were sent with the
//   // request, so delete both.
//   return {
//     valid: false,
//     deleteCookies: true,
//   }
// }

// /**
//  * refreshTokens
//  *
//  * Performs the actual token refresh.
//  *
//  * @param refresh_token
//  * @returns
//  */
// const refreshTokens = async (refresh_token: string, provider: Provider) => {
//   const core = await getCoreCommands()
//   const result = await core.adminUsers.refreshSessionTokens(refresh_token)
//   if (result.ok) {
//     return result.data
//   }
// }

// /**
//  * verifyAccessToken
//  *
//  * Verifies the session/access token, including running its payload through a
//  * zod schema.  Session is considered 'expired' if the access token has actually
//  * expired, or will expire within a short window of time (currently 30 seconds).
//  *
//  * @param access_token
//  * @returns
//  */
// const verifyAccessToken = async (
//   access_token: string | undefined
// ): Promise<{
//   status: 'valid' | 'invalid' | 'expired'
//   provider: Provider
//   // session?: Session | undefined
// }> => {
//   // Treat a missing access token as expired -- the cookie that carries the
//   // access token should expire shortly after the token, after which point the
//   // browser will no longer send it.
//   if (access_token == null) {
//     return {
//       status: 'expired',
//       provider: undefined,
//     }
//   }

//   const { api } = getServerConfig()

//   try {
//     const { payload } = await jwtVerify(access_token, {
//       alg: 'RS256',
//       aud: api.jwt.audience,
//       iss: api.jwt.issuer,
//       spki: api.jwt.publicKey,
//     })

//     // TODO: Is it worth it to validate the payload like this?
//     const { success, data } = accessTokenSchema.safeParse(payload)
//     if (success) {
//       // If the token will expire within 30 seconds, treat it as
//       // already-expired.  TODO: Make the 30 seconds configurable.
//       if (data.exp < Date.now() / 1000 + 30) {
//         return {
//           status: 'expired',
//           provider: data.provider,
//         }
//       }
//       return {
//         status: 'valid',
//         provider: data.provider,
//       }
//     }
//     return {
//       status: 'invalid',
//       provider: payload.provider as Provider,
//     }
//   } catch (err) {
//     if (err instanceof JWTExpired) {
//       return {
//         status: 'expired',
//         provider: err.payload.provider as Provider,
//       }
//     }
//     return {
//       status: 'invalid',
//       provider: undefined,
//     }
//   }
// }

// /**
//  * verifyRefreshToken
//  *
//  * Verifies the refresh token, including running its payload through a
//  * zod schema.  Refresh token can only be valid or invalid. Invalid means
//  * end of session and we'll treat the user as unauthenticated, letting
//  * middleware decide where the user has to authenticate / sign in again
//  *
//  * @param refresh_token
//  * @returns
//  */
// const verifyRefreshToken = async (
//   refresh_token: string | undefined
// ): Promise<{
//   status: 'valid' | 'invalid'
//   provider: Provider
// }> => {
//   // Treat a missing or expired refresh token as end of session
//   if (refresh_token == null) {
//     return {
//       status: 'invalid',
//       provider: undefined,
//     }
//   }

//   const { api } = getServerConfig()

//   try {
//     const { payload } = await jwtVerify(refresh_token, {
//       alg: 'RS256',
//       aud: api.jwt.audience,
//       iss: api.jwt.issuer,
//       spki: api.jwt.publicKey,
//     })

//     // TODO: Is it worth it to validate the payload like this?
//     const { success, data } = refreshTokenSchema.safeParse(payload)
//     if (success) {
//       return {
//         status: 'valid',
//         provider: data.provider,
//         // session: data,
//       }
//     }
//     return {
//       status: 'invalid',
//       provider: payload.provider as Provider,
//     }
//   } catch (err) {
//     if (err instanceof JWTExpired) {
//       return {
//         status: 'invalid',
//         provider: err.payload.provider as Provider,
//       }
//     }
//     return {
//       status: 'invalid',
//       provider: undefined,
//     }
//   }
// }

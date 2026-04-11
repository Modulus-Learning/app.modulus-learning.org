import { getServerConfig } from '@/config'

export function sessionCookieOptions() {
  const config = getServerConfig()
  return {
    path: '/',
    sameSite: config.cookies.userSession.sameSite,
    httpOnly: config.cookies.userSession.httpOnly,
    secure: config.cookies.userSession.secure,
    expires: new Date(Date.now() + 1 * 60 * 1000), // 1 minutes
    // expires: new Date(new Date().getTime() + 10 * 60 * 1000), // 10 minutes
  }
}

export function refreshCookieOptions(remember_me: boolean) {
  const config = getServerConfig()
  // TODO: Encrypt the refresh token first
  // Calculate 30 days into the future - new Chrome upper limit
  const daysIntoFuture = 30
  const millisecondsInADay = 24 * 60 * 60 * 1000 // 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
  return {
    path: '/',
    sameSite: config.cookies.userRefresh.sameSite,
    httpOnly: config.cookies.userRefresh.httpOnly,
    secure: config.cookies.userRefresh.secure,
    ...(remember_me === true && {
      expires: new Date(Date.now() + daysIntoFuture * millisecondsInADay),
    }),
  }
}

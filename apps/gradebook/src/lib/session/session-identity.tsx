import { useEffect } from 'react'

import { setExpectedPrincipal, startSessionNotifications } from './coordination'
import type { SessionDomain } from './principal'

/**
 * Records the principal this page was rendered for (spec: Authentication And
 * Sessions, item 7), from the layout's own loader data, and starts listening
 * for sign-in/sign-out notices from other tabs. Renders nothing.
 */
export function SessionIdentity({
  domain,
  userId,
}: {
  domain: SessionDomain
  userId: string | null
}) {
  useEffect(() => {
    setExpectedPrincipal(domain, userId != null ? { domain, userId } : null)
    startSessionNotifications(domain)
  }, [domain, userId])
  return null
}

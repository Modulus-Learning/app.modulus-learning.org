import { useEffect, useRef } from 'react'
import { useRouter, useRouterState } from '@tanstack/react-router'

import { renewInBrowser } from './browser-renewal'
import type { SessionDomain } from './principal'

/**
 * Public-page session recovery, ported from Byline's `AdminSessionRecovery`
 * (spec: Authentication And Sessions, item 5). Public pages render with
 * verification only, so a signed-in user whose access token has just expired
 * sees the anonymous chrome. Mounted with the `renewable` hint from the
 * layout's loader, this renews once per location and re-runs the loaders so
 * the app bar reflects the renewed session. A terminal outcome stops further
 * attempts for the life of the page. It renders nothing.
 */
const suppressed = new Set<SessionDomain>()

export function SessionRecovery({
  domain,
  renewable,
}: {
  domain: SessionDomain
  renewable: boolean
}) {
  const router = useRouter()
  const href = useRouterState({ select: (state) => state.location.href })
  const inFlight = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `href` re-arms recovery on navigation so a transient failure can be retried on the next location.
  useEffect(() => {
    if (!renewable || inFlight.current || suppressed.has(domain)) return
    inFlight.current = true
    renewInBrowser(domain)
      .then((outcome) => {
        if (outcome.status === 'terminal') suppressed.add(domain)
        else if (outcome.status !== 'transient') return router.invalidate()
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [domain, renewable, href, router])

  return null
}

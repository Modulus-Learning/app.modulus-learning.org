import { useCallback, useEffect, useState } from 'react'

import { type BootstrapStep, bootstrapStep } from './bootstrap'
import { renewInBrowser } from './browser-renewal'
import type { SessionDomain } from './principal'
import type { RenewalOutcome } from './renewal'

// Module-level defaults keep the props referentially stable: a default created
// inside the component would re-create `attempt` on every render and re-run the
// renewal effect after the first state update (a second renewal call).
const replaceLocation = (href: string) => window.location.replace(href)

const isFramed = () => {
  try {
    return window.top !== window.self
  } catch {
    return true // a cross-origin parent: we are framed
  }
}

/**
 * The chromeless renewal bootstrap page body (`/auth/renew`, `/admin/renew`).
 * Renews once in the browser, then navigates back (with the loop-guard
 * marker), to sign-in, or to a bounded failure state. Never navigates the top
 * frame, and never retries automatically.
 */
export function SessionBootstrap({
  domain,
  returnParam,
  renew = renewInBrowser,
  navigate = replaceLocation,
}: {
  domain: SessionDomain
  returnParam: string | null
  renew?: (domain: SessionDomain) => Promise<RenewalOutcome>
  navigate?: (href: string) => void
}) {
  const [step, setStep] = useState<BootstrapStep | null>(null)

  const attempt = useCallback(async () => {
    setStep(null)
    const outcome = await renew(domain)
    const next = bootstrapStep({ domain, outcome, returnParam, framed: isFramed() })
    if (next.kind === 'navigate') navigate(next.href)
    setStep(next)
  }, [domain, returnParam, renew, navigate])

  useEffect(() => {
    void attempt()
  }, [attempt])

  if (step?.kind === 'session-unavailable') {
    return (
      <main className="p-8" role="alert">
        <h1 className="text-xl font-semibold">Session unavailable</h1>
        <p className="mt-2">
          Your Modulus session could not be restored in this window. Please relaunch the activity
          from Canvas.
        </p>
      </main>
    )
  }

  if (step?.kind === 'retry') {
    return (
      <main className="p-8" role="alert">
        <h1 className="text-xl font-semibold">We couldn't restore your session</h1>
        <p className="mt-2">Check your connection and try again.</p>
        <button type="button" className="mt-4 underline" onClick={() => void attempt()}>
          Try again
        </button>
      </main>
    )
  }

  return (
    <main className="p-8" aria-busy="true">
      <p>Restoring your session…</p>
    </main>
  )
}

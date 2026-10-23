import { ErrorComponent, type ErrorComponentProps, useRouter } from '@tanstack/react-router'

import { SessionRenewalUnavailable } from '@/lib/session/route-guard'

/** The manual-retry state for a transient renewal failure (no automatic retry). */
export function SessionRetryView({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="p-8" role="alert">
      <h1 className="text-xl font-semibold">We couldn't restore your session</h1>
      <p className="mt-2">Check your connection and try again.</p>
      <button type="button" className="mt-4 underline" onClick={onRetry}>
        Try again
      </button>
    </main>
  )
}

/**
 * `errorComponent` for the protected layouts: a transient renewal failure
 * renders the retry state, and "Try again" re-runs the guard once. Any other
 * error renders the router's default error view.
 */
export function SessionGuardError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  if (error instanceof SessionRenewalUnavailable) {
    return (
      <SessionRetryView
        onRetry={() => {
          reset()
          void router.invalidate()
        }}
      />
    )
  }
  return <ErrorComponent error={error} />
}

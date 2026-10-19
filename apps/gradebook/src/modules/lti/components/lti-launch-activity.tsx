'use client'

import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@infonomic/uikit/react'

import type { UserSession } from '@/modules/app/session/@types'

const COUNTDOWN_SECONDS = 10

const replaceLocation = (url: string): void => window.location.replace(url)

/**
 * The LTI launch interstitial.
 *
 * The launch itself is a navigation, not a script: the primary control is an
 * anchor present in the server-rendered HTML, so the page works with scripting
 * disabled. The countdown decorates that anchor and is the only launch
 * behaviour that needs JavaScript.
 *
 * The two URL props are deliberately distinct, because the page displays a
 * different string from the one it navigates to:
 *
 * - `destination` is the fully-built launch URL, used only as the anchor
 *   `href`; and
 * - `activityUrl` is the clean canonical activity URL, used only for the
 *   displayed destination disclosure.
 *
 * Collapsing them would either lose the disclosure or show the learner
 * `...?modulus=https://...&scope_id=...`, a materially worse disclosure than
 * the bare activity URL -- and the disclosure is one of the reasons this page
 * is kept at all.
 */
export function LtiLaunchActivity({
  session,
  destination,
  activityUrl,
  scopeName,
  isDefaultScope,
  navigate = replaceLocation,
}: {
  session: UserSession | null
  destination: string
  activityUrl: string
  scopeName: string | null
  isDefaultScope: boolean
  navigate?: (url: string) => void
}): React.JSX.Element {
  const [countdown, setCountdown] = useState<number | null>(COUNTDOWN_SECONDS)

  const handleLaunch = useCallback(() => {
    navigate(destination)
  }, [navigate, destination])

  const handleCancelTimer = useCallback(() => {
    setCountdown(null)
  }, [])

  useEffect(() => {
    if (countdown == null) return
    if (countdown <= 0) {
      handleLaunch()
      return
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev != null ? prev - 1 : null))
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, handleLaunch])

  const sessionName = session?.user?.full_name ?? 'unknown'

  return (
    <div className="flex justify-center mt-[12vh] sm:mt-[18vh] bg-gray-50 not-dark">
      <div className="max-w-lg w-full p-8 bg-white rounded-lg shadow border">
        <h1 className="text-xl font-semibold mb-6">Launching Activity</h1>

        <div className="space-y-4 mb-8">
          <p className="text-gray-600">
            Welcome, <strong>{sessionName}</strong>. You are about to be redirected to a
            Modulus-enabled activity at:
          </p>
          <p className="text-blue-600 text-sm break-all font-medium">{activityUrl}</p>
          <p className="text-gray-600" data-testid="scope-context">
            {scopeName != null ? (
              <>
                This activity will use the <strong>{scopeName}</strong> learning context.
              </>
            ) : isDefaultScope ? (
              'This activity will use the default learning context.'
            ) : (
              'This activity will use a scoped learning context.'
            )}
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          {/*
            Rendered as an anchor rather than a button so the launch is in the
            initial HTML and survives with scripting disabled.
          */}
          <Button intent="success" render={<a href={destination} />}>
            Launch Now
          </Button>
          <p className="text-sm text-gray-500">
            {countdown != null ? (
              <>
                Redirecting automatically in <strong className="tabular-nums">{countdown}</strong>{' '}
                {countdown === 1 ? 'second' : 'seconds'}...{' '}
                <button
                  type="button"
                  onClick={handleCancelTimer}
                  className="underline hover:text-gray-700"
                >
                  Cancel
                </button>
              </>
            ) : (
              'Auto-redirect cancelled.'
            )}
          </p>
        </div>

        <p className="mt-6 text-xs text-gray-400 text-center">
          If you are not redirected automatically,{' '}
          <a href={destination} className="underline hover:text-gray-600">
            open the activity
          </a>
          .
        </p>
        <noscript>
          <p className="mt-6 text-sm text-gray-600">
            Automatic redirection needs JavaScript. Use the <strong>Launch Now</strong> link above
            to open the activity.
          </p>
        </noscript>
      </div>
    </div>
  )
}

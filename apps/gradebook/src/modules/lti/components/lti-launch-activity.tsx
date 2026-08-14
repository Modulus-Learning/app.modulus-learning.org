'use client'

import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@infonomic/uikit/react'

import { buildActivityLaunchUrl } from '@/modules/app/activity/launch-url'
import type { StartActivityResult } from '@/modules/app/activity/@types'
import type { UserSession } from '@/modules/app/session/@types'

const COUNTDOWN_SECONDS = 10

const replaceLocation = (url: string): void => window.location.replace(url)

export function LtiLaunchActivity({
  session,
  startActivityResult,
  isDefaultScope,
  navigate = replaceLocation,
}: {
  session: UserSession | null
  startActivityResult: StartActivityResult
  isDefaultScope: boolean
  navigate?: (url: string) => void
}): React.JSX.Element {
  const [countdown, setCountdown] = useState<number | null>(COUNTDOWN_SECONDS)

  const handleLaunch = useCallback(() => {
    if (startActivityResult.data != null) {
      navigate(
        buildActivityLaunchUrl({
          activityUrl: startActivityResult.data.activity.url,
          modulusServerUrl: startActivityResult.data.modulus_server_url,
          scopeId: startActivityResult.data.scope_id,
        })
      )
    }
  }, [navigate, startActivityResult])

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
  const activityUrl = startActivityResult.data?.activity?.url
  const scopeName = startActivityResult.data?.scope_name

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
          <Button intent="success" onClick={handleLaunch}>
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
          If you are not redirected,{' '}
          <button type="button" onClick={handleLaunch} className="underline hover:text-gray-600">
            click here
          </button>
          .
        </p>
        <noscript>
          <p className="mt-6 text-sm text-red-700">
            JavaScript is required to launch this activity.
          </p>
        </noscript>
      </div>
    </div>
  )
}

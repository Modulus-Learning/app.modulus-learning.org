'use client'

import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@infonomic/uikit/react'

import type { StartActivityResult } from '@/modules/app/activity/@types'
import type { UserSession } from '@/modules/app/session/@types'

const COUNTDOWN_SECONDS = 10

export function LtiLaunchActivity({
  session,
  startActivityResult,
}: {
  session: UserSession | null
  startActivityResult: StartActivityResult
}): React.JSX.Element {
  const [countdown, setCountdown] = useState<number | null>(COUNTDOWN_SECONDS)

  const handleLaunch = useCallback(() => {
    if (startActivityResult.data != null) {
      const modulusServerURL = encodeURIComponent(startActivityResult.data.modulus_server_url)
      window.location.replace(
        `${startActivityResult.data.activity.url}?modulus=${modulusServerURL}`
      )
    }
  }, [startActivityResult])

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
      </div>
    </div>
  )
}

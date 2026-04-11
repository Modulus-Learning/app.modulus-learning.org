'use client'

import type React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@infonomic/uikit/react'

import type { Locale } from '@/i18n/i18n-config'
import type { UserSession } from '@/modules/app/session/@types'
import type { StartActivityResult } from '../@types'

export function LaunchActivity({
  lng,
  session,
  currentPath,
  destinationURL,
  startActivityResult,
}: {
  lng: Locale
  session: UserSession | null
  currentPath: string | null
  destinationURL: string | null
  startActivityResult: StartActivityResult
}): React.JSX.Element {
  const router = useRouter()

  const handleOnLaunch = () => {
    if (startActivityResult.data != null) {
      const modulusServerURL = encodeURIComponent(startActivityResult.data.modulus_server_url)
      router.replace(`${startActivityResult?.data?.activity.url}?modulus=${modulusServerURL}`)
    }
  }

  const sessionName = session?.user?.full_name ?? session?.user.full_name ?? 'unknown'

  return (
    <div className="max-w-[920px] mx-auto">
      <div className="grid  grid-cols-1 sm:grid-cols-2 items-stretch gap-6 mt-8 mb-4">
        <div className="p-4 w-full bg-white rounded-lg shadow border dark:bg-canvas-900 dark:border-gray-600">
          <h2 className="mb-4">Modulus Activity</h2>
          <div className="prose">
            <p>
              Welcome to Modulus. Modulus is an online grade book for distributed learning content.
            </p>
            <p>You are about to start a Modulus-enabled activity located at:</p>
            <p className="text-blue-600">
              <strong>{startActivityResult.data?.activity?.url}</strong>
            </p>
          </div>
        </div>
        <div className="p-4 w-full bg-white rounded-lg shadow border dark:bg-canvas-900 dark:border-gray-600">
          <h2 className="mb-4">Launch Activity</h2>
          <div className="actions flex items-center justify-center gap-4 mt-8 mb-8">
            <Button intent="success" onClick={handleOnLaunch}>
              Launch Activity as {sessionName}
            </Button>
          </div>
          <p className="mb-4">
            You are currently logged in as <strong>{sessionName}</strong> and you&apos;ve come from
            the Ohio State University Canvas Learning Management System (LMS).
          </p>
          <p className="muted text-sm m-0">
            If you do not wish to start this activity as {sessionName}, please sign out and start
            again.
          </p>
        </div>
      </div>
      <div className="prose muted max-w-[920px] mx-auto px-2">
        <p className="m-0">
          If you&apos;re not sure why you&apos;re seeing this page, or you would like to learn more
          about Modulus you may contact your instructor, or visit ... for more information including
          terms, privacy policy, institutional information etc.
        </p>
      </div>
    </div>
  )
}

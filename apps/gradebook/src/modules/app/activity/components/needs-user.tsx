'use client'

import type React from 'react'

import { SignIn } from '@/modules/app/session/components/sign-in'
import type { Locale } from '@/i18n/i18n-config'

export function NeedsUser({
  lng,
  currentPath,
  destinationURL,
}: {
  lng: Locale
  currentPath: string | null
  destinationURL: string | null
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 items-stretch gap-6 max-w-[920px] mx-auto mt-8 mb-12">
      <div className="p-4 w-full bg-white rounded-lg shadow border dark:bg-canvas-900 dark:border-gray-600">
        <h2 className="mb-4">Start Activity</h2>
        <div className="prose">
          <p>
            Welcome to Modulus. Modulus is an online grade book for distributed learning content.
          </p>
          <p>You are about to start a Modulus-enabled activity located at:</p>
          <p className="text-blue-600">
            <strong>{destinationURL}</strong>
          </p>
          <p className="mb-4">
            Before you start you&apos;ll need to sign in to Modulus or sign up for a new account.
          </p>
        </div>
        <div className="prose muted hidden sm:block">
          <p>
            If you&apos;re not sure why you&apos;re seeing this page, or you would like to learn
            more about Modulus you may contact your instructor, or visit ... for more information
            including terms, privacy policy, institutional information etc.
          </p>
        </div>
      </div>
      <div>
        <SignIn
          lng={lng}
          style="compact"
          source={currentPath ?? '/'}
          callBackUrl={currentPath ?? '/'}
        />
      </div>
      <div className="prose muted block sm:hidden">
        <p className="m-0 px-2">
          If you&apos;re not sure why you&apos;re seeing this page, or you would like to learn more
          about Modulus you may contact your instructor, or visit ... for more information including
          terms, privacy policy, institutional information etc.
        </p>
      </div>
    </div>
  )
}

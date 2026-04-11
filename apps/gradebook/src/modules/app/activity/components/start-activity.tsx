'use client'

import type React from 'react'

import { LaunchActivity } from './launch-activity'
import { NeedsUser } from './needs-user'
import type { Locale } from '@/i18n/i18n-config'
import type { UserSession } from '@/modules/app/session/@types'
import type { StartActivityResult } from '../@types'

export function StartActivity({
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
  if (startActivityResult.status === 'success' && startActivityResult.data != null) {
    return (
      <LaunchActivity
        lng={lng}
        startActivityResult={startActivityResult}
        session={session}
        currentPath={currentPath}
        destinationURL={destinationURL}
      />
    )
  }

  if (startActivityResult.status === 'failed') {
    return <div>Invalid activity (TODO: Missing or failed activity UI)</div>
  }

  return <NeedsUser lng={lng} currentPath={currentPath} destinationURL={destinationURL} />
}

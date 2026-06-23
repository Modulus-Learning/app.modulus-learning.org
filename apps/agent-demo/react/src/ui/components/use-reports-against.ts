import { useEffect } from 'react'

import { useModulus } from './modulus-provider'

interface ReportsAgainstConfig {
  // The activity this one reports a calculation of its own progress against.
  // May be an absolute URL or a path relative to the current origin (it is
  // resolved against `window.location.origin`, matching how activity URLs are
  // formed elsewhere).
  url: string
  // The normalized (0..1) amount this activity contributes to `url` at full
  // (1.0) own-progress.  The agent submits `ownProgress * maxContribution`.
  maxContribution: number
}

/**
 * Declares that the current activity reports a calculation of its own progress
 * against another activity (cumulative / "umbrella" reporting).  The target is
 * registered with the agent on mount and removed on unmount, after which every
 * progress submission automatically includes the computed contribution.
 */
export const useReportsAgainst = ({ url, maxContribution }: ReportsAgainstConfig) => {
  const { modulus } = useModulus()

  useEffect(() => {
    const absoluteUrl = new URL(url, window.location.origin).toString()
    return modulus.addReportTarget({ url: absoluteUrl, maxContribution })
  }, [modulus, url, maxContribution])
}

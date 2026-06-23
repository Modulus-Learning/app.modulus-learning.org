import { useEffect } from 'react'

import { useModulus } from './modulus-provider'

interface ContributesToConfig {
  // The cumulative ("accumulator") activity this one contributes to.  May be an
  // absolute URL or a path relative to the current origin (it is resolved
  // against `window.location.origin`, matching how activity URLs are formed
  // elsewhere).
  url: string
  // The normalized (0..1) share of this activity's progress that flows to `url`.
  // The server applies `Δself × factor` to the target.
  factor: number
}

/**
 * Declares that the current activity contributes a calculation of its own
 * progress to another (cumulative / "accumulator") activity.  The target is
 * registered with the agent on mount and removed on unmount, after which every
 * progress submission automatically includes the computed contribution.
 *
 * Call it more than once to contribute to multiple accumulators.
 */
export const useContributesTo = ({ url, factor }: ContributesToConfig) => {
  const { modulus } = useModulus()

  useEffect(() => {
    const absoluteUrl = new URL(url, window.location.origin).toString()
    return modulus.addContributionTarget({ url: absoluteUrl, factor })
  }, [modulus, url, factor])
}

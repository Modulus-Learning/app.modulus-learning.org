import { buildActivityLaunchUrl } from '@/modules/app/activity/launch-url'

export type LaunchInterstitialMode = 'never' | 'always'

/**
 * Chooses where a verified LTI resource-link launch sends the learner.
 *
 * - `never` returns the activity URL itself, carrying only `modulus` and
 *   `scope_id` — one hop, no Modulus-owned page in between.
 * - `always` returns the id-keyed interstitial, which links on to exactly the
 *   URL `never` would have produced.
 *
 * There is deliberately no role argument. The destination does not branch on
 * whether the launching user is an instructor or a learner, and the absence of
 * the parameter is the contract: a caller cannot pass a role even by mistake.
 *
 * No Modulus-owned URL on this path embeds an activity URL, so no activity URL
 * has to survive a round trip through the router. Nothing here carries the
 * scope *name*, or the activity code — see `handleActivityLaunch`, which has
 * already resolved the code and made the enrollment decision by this point.
 */
export const selectLaunchDestination = ({
  mode,
  activityId,
  activityUrl,
  scopeId,
  modulusServerUrl,
}: {
  mode: LaunchInterstitialMode
  activityId: string
  activityUrl: string
  scopeId: string
  modulusServerUrl: string
}): string =>
  mode === 'always'
    ? `/lti/launch/${activityId}?${new URLSearchParams({ scope_id: scopeId })}`
    : buildActivityLaunchUrl({ activityUrl, modulusServerUrl, scopeId })

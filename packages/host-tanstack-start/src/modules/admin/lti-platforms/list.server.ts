import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { Locale } from '@/i18n/i18n-config'
import type { LtiPlatformsResponse } from './@types'

// TODO: consider a response object with status and message
// so that we can communicate more than 'noFound' in the UI.
export async function listLtiPlatforms(_locale: Locale): Promise<LtiPlatformsResponse> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      platforms: [],
    }
  }

  const core = await getCoreCommands()
  const result = await core.admin.ltiPlatforms.listLtiPlatforms(adminAuth)

  if (result.ok) {
    return {
      platforms: result.data.platforms,
    }
  }

  return {
    platforms: [],
  }
}

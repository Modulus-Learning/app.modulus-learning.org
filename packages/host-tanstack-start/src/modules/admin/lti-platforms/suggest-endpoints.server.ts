import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import type { LtiPlatformEndpoints } from './@types'

export type SuggestLtiPlatformEndpointsResult =
  | { ok: true; endpoints: LtiPlatformEndpoints }
  | { ok: false; message: string }

/** The LMS adapter's default endpoints for `issuer`, for the form to offer. */
export async function suggestLtiPlatformEndpoints(
  issuer: string
): Promise<SuggestLtiPlatformEndpointsResult> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return { ok: false, message: 'Not logged in.' }
  }

  const core = await getCoreCommands()
  const result = await core.admin.ltiPlatforms.suggestLtiPlatformEndpoints(adminAuth, {
    issuer: typeof issuer === 'string' ? issuer : '',
  })

  if (result.ok) {
    const { authorization_endpoint, token_endpoint, jwks_uri, authorization_server } = result.data
    return {
      ok: true,
      endpoints: { authorization_endpoint, token_endpoint, jwks_uri, authorization_server },
    }
  }

  if (result.error.code === 'ERR_VALIDATION') {
    return { ok: false, message: 'Enter a valid https issuer first.' }
  }

  if (result.error.code === 'ERR_FORBIDDEN') {
    return { ok: false, message: 'You do not have permission to suggest endpoints.' }
  }

  return { ok: false, message: 'Failed to suggest endpoints.' }
}

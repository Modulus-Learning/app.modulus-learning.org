import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import { cookies, redirect } from '@/lib/server-request'
import { type LtiPlatformFormState, ltiPlatformEditSchema } from './@types'

export async function updateLtiPlatform(
  _prevState: LtiPlatformFormState,
  formData: FormData
): Promise<LtiPlatformFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (adminAuth == null) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  // The issuer is immutable: it is neither read here nor sent to core.
  const validatedFields = ltiPlatformEditSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    client_id: formData.get('client_id'),
    authorization_endpoint: formData.get('authorization_endpoint'),
    token_endpoint: formData.get('token_endpoint'),
    jwks_uri: formData.get('jwks_uri'),
    authorization_server: formData.get('authorization_server'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to update LTI platform.',
      status: 'failed',
    }
  }

  const { id, name } = validatedFields.data

  const core = await getCoreCommands()
  const result = await core.admin.ltiPlatforms.updateLtiPlatform(adminAuth, validatedFields.data)

  if (result.ok) {
    const config = getServerConfig()
    const cookieJar = await cookies()

    cookieJar.set(
      config.cookies.flash.name,
      `LTI Platform Updated::${name} LTI platform updated successfully.`,
      {
        path: '/',
        httpOnly: config.cookies.flash.httpOnly,
        secure: config.cookies.flash.secure,
        sameSite: config.cookies.flash.sameSite,
        maxAge: 0,
      }
    )

    redirect(`/admin/lti-platforms/${id}`)
  }

  if (result.error.code === 'ERR_NOT_FOUND') {
    return {
      errors: {},
      message: 'This LTI platform can no longer be found.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_FORBIDDEN') {
    return {
      errors: {},
      message: 'You do not have permission to edit LTI platforms.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to update LTI platform.',
    status: 'failed',
  }
}

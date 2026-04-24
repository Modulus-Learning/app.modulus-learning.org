'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreAdminRequestContext } from '@/core-adapter'
import { type LtiPlatformFormState, ltiPlatformCreateSchema } from './@types'

export async function createLtiPlatform(
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

  const validatedFields = ltiPlatformCreateSchema.safeParse({
    name: formData.get('name'),
    issuer: formData.get('issuer'),
    client_id: formData.get('client_id'),
    deployment_id: formData.get('deployment_id'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to create LTI platform.',
      status: 'failed',
    }
  }

  const { name } = validatedFields.data

  // TODO: call into core to actually persist the new LTI platform.
  // const core = await getCoreCommands()
  // const result = await core.admin.ltiPlatforms.createLtiPlatform(adminAuth, {
  //   name,
  //   issuer,
  //   client_id,
  //   deployment_id,
  // })

  const config = getServerConfig()
  const cookieJar = await cookies()

  cookieJar.set(
    config.cookies.flash.name,
    `LTI Platform Created::${name} LTI platform created successfully.`,
    {
      path: '/',
      httpOnly: config.cookies.flash.httpOnly,
      secure: config.cookies.flash.secure,
      sameSite: config.cookies.flash.sameSite,
      maxAge: 0,
    }
  )

  redirect('/admin/lti-platforms')
}

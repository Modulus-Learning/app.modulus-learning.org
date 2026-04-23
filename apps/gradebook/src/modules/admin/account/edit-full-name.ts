'use server'

import { z } from 'zod'

import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import { type NameFormState, nameEditSchema } from './@types'

export async function editFullName(
  _prevState: NameFormState,
  formData: FormData
): Promise<NameFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (!adminAuth) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = nameEditSchema.safeParse({
    id: formData.get('id'),
    vid: formData.get('vid'),
    lng: formData.get('lng'),
    given_name: formData.get('given_name'),
    family_name: formData.get('family_name'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to update account.',
      status: 'failed',
    }
  }

  const { id, vid, lng, given_name, family_name } = validatedFields.data

  const core = await getCoreCommands()
  const result = await core.admin.account.setFullName(adminAuth, {
    id,
    vid,
    given_name,
    family_name,
  })

  if (result.ok) {
    return {
      errors: {},
      message: 'Account updated.',
      status: 'success',
      response: result.data,
    }
  }

  if (result.error.code === 'ERR_VERSION_CONFLICT') {
    return {
      errors: {},
      message: 'This account is no longer up to date. Please reload the account.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_NOT_FOUND') {
    return {
      errors: {},
      message: 'This account can no longer be found..',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to update account.',
    status: 'failed',
  }
}

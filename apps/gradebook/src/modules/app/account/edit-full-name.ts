'use server'

import { z } from 'zod'

import { getCoreInstance, getCoreUserRequestContext } from '@/core-adapter'
import { type NameFormState, nameEditSchema } from './@types'

export async function editFullName(
  _prevState: NameFormState,
  formData: FormData
): Promise<NameFormState> {
  // TODO: Logging.

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
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
    full_name: formData.get('full_name'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to update account.',
      status: 'failed',
    }
  }

  // TODO: lng
  const { id, vid, lng, full_name } = validatedFields.data

  const core = await getCoreInstance()
  const result = await core.app.account.setFullName(userAuth, {
    id,
    vid,
    full_name,
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
    // TODO: should we call refresh() here?
    return {
      errors: {},
      message: 'This account is no longer up to date. Please reload the account.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_NOT_FOUND') {
    return {
      errors: {},
      message: 'This account can no longer be found.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to update account.',
    status: 'failed',
  }
}

'use server'

import { z } from 'zod'

import { getCoreCommands, getCoreUserRequestContext } from '@/core-adapter'
import { type SetPasswordFormState, setPasswordSchema } from './@types'

export async function setPassword(
  _prevState: SetPasswordFormState,
  formData: FormData
): Promise<SetPasswordFormState> {
  // TODO: Logging.

  const userAuth = await getCoreUserRequestContext()
  if (userAuth == null) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = setPasswordSchema.safeParse({
    id: formData.get('id'),
    vid: formData.get('vid'),
    lng: formData.get('lng'),
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
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
  const { id, vid, lng, password } = validatedFields.data

  const core = await getCoreCommands()
  const result = await core.app.account.setPassword(userAuth, {
    id,
    vid,
    password,
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

  if (result.error.code === 'ERR_CURRENT_PASSWORD') {
    return {
      errors: {},
      message: 'This account already has a password set.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_FORBIDDEN') {
    return {
      errors: {},
      message: "You don't have permission to edit this account",
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to update account.',
    status: 'failed',
  }
}

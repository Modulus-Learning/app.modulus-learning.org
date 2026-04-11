'use server'

import { z } from 'zod'

import { getCoreAdminRequestContext, getCoreInstance } from '@/core-adapter'
import { type ChangePasswordFormState, changePasswordSchema } from './@types'

export async function changePassword(
  _prevState: ChangePasswordFormState,
  formData: FormData
): Promise<ChangePasswordFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (!adminAuth) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = changePasswordSchema.safeParse({
    id: formData.get('id'),
    vid: formData.get('vid'),
    lng: formData.get('lng'),
    current_password: formData.get('current_password'),
    new_password: formData.get('new_password'),
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

  const { id, vid, lng, current_password, new_password } = validatedFields.data

  const core = await getCoreInstance()
  const result = await core.admin.account.changePassword(adminAuth, {
    id,
    vid,
    old_password: current_password,
    new_password,
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
      message: 'This account does not currently have a password set.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_UNAUTHORIZED') {
    return {
      errors: {},
      message: 'Invalid credentials.',
      status: 'failed',
    }
  }

  return {
    errors: {},
    message: 'Failed to update account.',
    status: 'failed',
  }
}

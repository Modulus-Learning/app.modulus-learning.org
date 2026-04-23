'use server'

import { z } from 'zod'

import { getCoreAdminRequestContext, getCoreCommands } from '@/core-adapter'
import {
  type ChangeEmailFormState,
  changeEmailSchema,
  type VerifyEmailFormState,
  verifyEmailSchema,
} from './@types'

export async function changeEmail(
  _prevState: ChangeEmailFormState,
  formData: FormData
): Promise<ChangeEmailFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (!adminAuth) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = changeEmailSchema.safeParse({
    id: formData.get('id'),
    vid: formData.get('vid'),
    lng: formData.get('lng'),
    email: formData.get('email'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to update account.',
      status: 'failed',
    }
  }

  const { id, vid, lng, email } = validatedFields.data

  const core = await getCoreCommands()
  const result = await core.admin.account.changeEmail(adminAuth, {
    id,
    vid,
    email,
  })

  if (result.ok) {
    return {
      errors: {},
      message: 'Account change email request received.',
      status: 'success',
      email: email,
    }
  }

  if (result.error.code === 'ERR_VERSION_CONFLICT') {
    return {
      errors: {},
      message: 'This account is no longer up to date. Please reload the account.',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_UNIQUE_CONSTRAINT') {
    return {
      errors: {},
      message: "The email address you've requested is not available.",
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_EMAIL_UNCHANGED') {
    return {
      errors: {},
      message: 'The email address you entered is already registered to your account.',
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

export async function verifyEmail(
  _prevState: VerifyEmailFormState,
  formData: FormData
): Promise<VerifyEmailFormState> {
  const adminAuth = await getCoreAdminRequestContext()
  if (!adminAuth) {
    return {
      errors: {},
      message: 'Not logged in.',
      status: 'failed',
    }
  }

  const validatedFields = verifyEmailSchema.safeParse({
    id: formData.get('id'),
    lng: formData.get('lng'),
    verification_code: formData.get('verification_code'),
  })

  // If form validation fails, return errors early. Otherwise, continue...
  if (validatedFields.success === false) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: 'Unable to update user.',
      status: 'failed',
    }
  }

  const { id, lng, verification_code } = validatedFields.data

  const core = await getCoreCommands()
  const result = await core.admin.account.verifyEmail(adminAuth, {
    id,
    verification_code,
  })

  if (result.ok) {
    return {
      errors: {},
      message: 'Account email updated.',
      status: 'success',
      response: result.data,
    }
  }

  if (result.error.code === 'ERR_VERIFICATION_CODE_INVALID') {
    return {
      errors: { verification_code: ['Verification code is incorrect.'] },
      message: 'Please double-check the verification code in the email you received',
      status: 'failed',
    }
  }

  if (result.error.code === 'ERR_VERIFICATION_CODE_EXPIRED') {
    return {
      errors: { verification_code: ['Verification code has expired.'] },
      message:
        'You must verify your new email address within one hour of requesting email verification.',
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
    message: 'Failed to verify email.',
    status: 'failed',
  }
}

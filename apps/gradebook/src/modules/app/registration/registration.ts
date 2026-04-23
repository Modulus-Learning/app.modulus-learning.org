'use server'

import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getCoreCommands, getCoreRequestContext } from '@/core-adapter'
import { setUserSession } from '../session/storage'
import { registrationStep1Schema, registrationStep2Schema, registrationStep3Schema } from './@types'
import type {
  RegistrationStep1FormState,
  RegistrationStep2FormState,
  RegistrationStep3FormState,
} from './@types'

/**
 * registrationStep1
 *
 * @param _prevState
 * @param formData
 * @returns
 */
export const registrationStep1 = async (
  _prevState: RegistrationStep1FormState,
  formData: FormData
): Promise<RegistrationStep1FormState> => {
  // TODO: Logging

  const validationResult = registrationStep1Schema.safeParse({
    email: formData.get('email'),
    full_name: formData.get('full_name'),
    agree_to_terms: formData.get('agree_to_terms'),
  })

  if (validationResult.success === false) {
    return {
      errors: z.flattenError(validationResult.error).fieldErrors,
      message: 'Missing or invalid fields in form.',
      status: 'failed',
    }
  }

  const core = await getCoreCommands()
  const ctx = await getCoreRequestContext()
  const result = await core.app.registration.preRegister(ctx, {
    email: validationResult.data.email,
    full_name: validationResult.data.full_name,
    agreed_to_terms: validationResult.data.agree_to_terms === 'on',
  })

  if (result.ok) {
    return {
      errors: {},
      message: 'Next step...',
      data: result.data,
      status: 'success',
    }
  }

  // TODO: Customize the response here based on result.error.code?
  return {
    errors: {},
    message: 'There was an error submitting your details.',
    status: 'failed',
  }
}

/**
 * registrationStep2
 * @param _prevState
 * @param formData
 * @returns
 */
export const registrationStep2 = async (
  _prevState: RegistrationStep2FormState,
  formData: FormData
): Promise<RegistrationStep2FormState> => {
  // TODO: Logging

  const validationResult = registrationStep2Schema.safeParse({
    id: formData.get('id'),
    verification_code: formData.get('verification_code'),
  })

  if (validationResult.success === false) {
    return {
      errors: z.flattenError(validationResult.error).fieldErrors,
      message: 'Missing or invalid fields in form.',
      status: 'failed',
    }
  }

  const core = await getCoreCommands()
  const ctx = await getCoreRequestContext()
  const result = await core.app.registration.verifyEmail(ctx, validationResult.data)

  if (result.ok) {
    return {
      errors: {},
      message: 'Next step...',
      data: result.data,
      status: 'success',
    }
  }

  // TODO: Customize the response here based on result.error.code?
  return {
    errors: {},
    message: 'There was an error submitting your verification code.',
    status: 'failed',
  }
}

/**
 * registrationStep3
 *
 * @param _prevState
 * @param formData
 * @returns
 */
export const registrationStep3 = async (
  _prevState: RegistrationStep3FormState,
  formData: FormData
): Promise<RegistrationStep3FormState> => {
  // TODO: Logging

  const validationResult = registrationStep3Schema.safeParse({
    id: formData.get('id'),
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
    callback_url: formData.get('callback_url'),
  })

  if (validationResult.success === false) {
    return {
      errors: z.flattenError(validationResult.error).fieldErrors,
      message: 'Missing or invalid fields in form.',
      status: 'failed',
    }
  }

  const core = await getCoreCommands()
  const ctx = await getCoreRequestContext()
  const result = await core.app.registration.register(ctx, {
    id: validationResult.data.id,
    password: validationResult.data.password,
  })

  if (!result.ok) {
    return {
      errors: {},
      message: 'There was an error submitting your password.',
      status: 'failed',
    }
  }

  await setUserSession(result.data)
  return redirect(validationResult.data.callback_url ?? '/?m=welcome')
}

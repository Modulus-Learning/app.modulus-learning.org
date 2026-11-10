import { setCookie } from '@tanstack/react-start/server'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreCommands, getCoreRequestContext } from '@/lib/core/start-adapter'
import { safeCallbackPath } from '@/lib/safe-redirect'
import { sessionCookieWrites, type TokenPair } from '@/lib/session/cookies'
import { registrationStep1Schema, registrationStep2Schema, registrationStep3Schema } from './@types'
import type {
  RegistrationStep1FormState,
  RegistrationStep2FormState,
  RegistrationStep3FormState,
} from './@types'

/**
 * Server halves of the TanStack Start registration steps, ported from the Next
 * actions in `./registration.ts` with the same validation and messages. Step 3
 * returns a redirect target instead of throwing a Next `redirect()`.
 */

export const step1 = async (formData: FormData): Promise<RegistrationStep1FormState> => {
  const validation = registrationStep1Schema.safeParse({
    email: formData.get('email'),
    full_name: formData.get('full_name'),
    agree_to_terms: formData.get('agree_to_terms'),
  })
  if (!validation.success) {
    return {
      errors: z.flattenError(validation.error).fieldErrors,
      message: 'Missing or invalid fields in form.',
      status: 'failed',
    }
  }
  const core = await getCoreCommands()
  const result = await core.app.registration.preRegister(getCoreRequestContext(), {
    email: validation.data.email,
    full_name: validation.data.full_name,
    agreed_to_terms: validation.data.agree_to_terms === 'on',
  })
  return result.ok
    ? { errors: {}, message: 'Next step...', data: result.data, status: 'success' }
    : { errors: {}, message: 'There was an error submitting your details.', status: 'failed' }
}

export const step2 = async (formData: FormData): Promise<RegistrationStep2FormState> => {
  const validation = registrationStep2Schema.safeParse({
    id: formData.get('id'),
    verification_code: formData.get('verification_code'),
  })
  if (!validation.success) {
    return {
      errors: z.flattenError(validation.error).fieldErrors,
      message: 'Missing or invalid fields in form.',
      status: 'failed',
    }
  }
  const core = await getCoreCommands()
  const result = await core.app.registration.verifyEmail(getCoreRequestContext(), validation.data)
  return result.ok
    ? { errors: {}, message: 'Next step...', data: result.data, status: 'success' }
    : {
        errors: {},
        message: 'There was an error submitting your verification code.',
        status: 'failed',
      }
}

export const step3 = async (
  formData: FormData
): Promise<{ state: RegistrationStep3FormState; redirectTo?: string }> => {
  const validation = registrationStep3Schema.safeParse({
    id: formData.get('id'),
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
    callback_url: formData.get('callback_url'),
  })
  if (!validation.success) {
    return {
      state: {
        errors: z.flattenError(validation.error).fieldErrors,
        message: 'Missing or invalid fields in form.',
        status: 'failed',
      },
    }
  }
  const core = await getCoreCommands()
  const result = await core.app.registration.register(getCoreRequestContext(), {
    id: validation.data.id,
    password: validation.data.password,
  })
  if (!result.ok) {
    return {
      state: {
        errors: {},
        message: 'There was an error submitting your password.',
        status: 'failed',
      },
    }
  }
  const { userSession, userRefresh } = getServerConfig().cookies
  for (const { name, value, options } of sessionCookieWrites(
    result.data as TokenPair,
    userSession,
    userRefresh
  )) {
    setCookie(name, value, options)
  }
  return {
    state: { errors: {}, status: 'success' },
    redirectTo: safeCallbackPath(validation.data.callback_url, '/?m=welcome'),
  }
}

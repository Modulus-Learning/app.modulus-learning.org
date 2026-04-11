'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getCoreInstance, getCoreRequestContext } from '@/core-adapter'
import { type SignInFormState, signInSchema } from './@types'
import { deleteUserSession, setUserSession } from './storage'

/**
 * signIn
 *
 * @param _prevState
 * @param formData
 * @returns
 */
export async function signIn(
  _prevState: SignInFormState,
  formData: FormData
): Promise<SignInFormState> {
  // TODO: logging?

  // TODO: Validate that callback_url is appropriate (i.e. whitelist a short list
  // of allowed paths)
  const validationResult = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    remember_me: formData.get('remember_me'),
    callback_url: formData.get('callback_url'),
  })

  if (validationResult.success === false) {
    return {
      errors: z.flattenError(validationResult.error).fieldErrors,
      message: 'Missing or invalid fields.',
      status: 'failed',
    }
  }

  const { email, password, remember_me, callback_url } = validationResult.data

  const headerList = await headers()
  // TODO: Check ip_address is a valid ip address, and set to undefined if not.
  const ip_address = headerList.get('x-real-ip') ?? undefined

  const core = await getCoreInstance()
  const ctx = await getCoreRequestContext()
  const signInResult = await core.app.session.signInPassword(ctx, {
    email,
    password,
    remember_me,
    ip_address,
  })

  if (!signInResult.ok) {
    // TODO: Inspect signInResult.error.code, and give more meaningful feedback
    // here?
    return {
      errors: {},
      message: 'We were unable to sign you in.',
      status: 'failed',
    }
  }

  await setUserSession(signInResult.data)

  // NOTE: Redirect in actions will not work if you are trying to redirect across route groups
  // and where there is no route layout. See the root layout.tsx for more...
  // https://github.com/vercel/next.js/issues/58263
  return redirect(callback_url ?? '/?m=welcome')
}

/**
 * signOut
 */
export async function signOut(): Promise<string> {
  await deleteUserSession()
  redirect('/')
}

'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { z } from 'zod'

import { getCoreCommands, getCoreRequestContext } from '@/core-adapter'
import { type SignInFormState, signInSchema } from './@types'
import { deleteAdminSession, setAdminSession } from './storage'

export const signIn = async (
  _prevState: SignInFormState,
  formData: FormData
): Promise<SignInFormState> => {
  // TODO: Validate that callbackUrl is appropriate (i.e. whitelist a short list
  // of allowed paths)
  const callbackURL = formData.get('callbackUrl')?.toString() ?? '/admin'

  const validationResult = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    remember_me: formData.get('remember_me'),
  })

  if (validationResult.success === false) {
    return {
      errors: z.flattenError(validationResult.error).fieldErrors,
      message: 'Missing or invalid fields.',
      status: 'failed',
    }
  }

  const { email, password, remember_me } = validationResult.data

  const headerList = await headers()
  // TODO: Check ip_address is a valid ip address, and set to undefined if not.
  const ip_address = headerList.get('x-real-ip') ?? undefined

  const core = await getCoreCommands()
  const ctx = await getCoreRequestContext()
  const signInResult = await core.admin.session.signInPassword(ctx, {
    email,
    password,
    remember_me,
    ip_address,
  })

  if (!signInResult.ok) {
    // TODO: Inspect signInResult.error.code (or other metadata) and give more
    // meaningful error message here?
    return {
      errors: {},
      message: 'We were unable to sign you in',
      status: 'failed',
    }
  }

  await setAdminSession(signInResult.data)

  if (callbackURL != null && callbackURL.length > 0) {
    redirect(decodeURIComponent(callbackURL))
  } else {
    redirect('/admin')
  }
}

/**
 * signOut
 */
export async function signOut(): Promise<string> {
  await deleteAdminSession()
  redirect('/')
}

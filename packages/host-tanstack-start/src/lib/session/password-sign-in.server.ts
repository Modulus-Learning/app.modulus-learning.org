import { deleteCookie, getRequestHeader, setCookie } from '@tanstack/react-start/server'

import { z } from 'zod'

import { getServerConfig } from '@/config'
import { getCoreCommands, getCoreRequestContext } from '@/lib/core/start-adapter'
import { safeCallbackPath } from '@/lib/safe-redirect'
import { sessionCookieWrites, type TokenPair } from '@/lib/session/cookies'
import { signInSchema as adminSignInSchema } from '@/modules/admin/session/@types'
import { signInSchema as userSignInSchema } from '@/modules/app/session/@types'
import type { SignInFormState as AdminSignInFormState } from '@/modules/admin/session/@types'
import type { SignInFormState as UserSignInFormState } from '@/modules/app/session/@types'

/**
 * Server halves of the TanStack Start sign-in and sign-out server functions,
 * ported from the Next `modules/{app,admin}/session/password-auth.ts` actions.
 * They return a redirect target instead of throwing a Next `redirect()`; the
 * browser wrapper (`@/framework` → `start.tsx`) performs the navigation inside
 * the session coordination queue.
 */

export interface SignInOutcome<TState> {
  state: TState
  redirectTo?: string
}

const writeSession = (tokens: TokenPair, domain: 'user' | 'admin') => {
  const { cookies } = getServerConfig()
  const [access, refresh] =
    domain === 'user'
      ? [cookies.userSession, cookies.userRefresh]
      : [cookies.adminSession, cookies.adminRefresh]
  for (const { name, value, options } of sessionCookieWrites(tokens, access, refresh)) {
    setCookie(name, value, options)
  }
}

const clearSession = (domain: 'user' | 'admin') => {
  const { cookies } = getServerConfig()
  const names =
    domain === 'user'
      ? [cookies.userSession.name, cookies.userRefresh.name]
      : [cookies.adminSession.name, cookies.adminRefresh.name]
  for (const name of names) deleteCookie(name, { path: '/' })
}

export const signInUser = async (
  formData: FormData
): Promise<SignInOutcome<UserSignInFormState>> => {
  const validation = userSignInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    remember_me: formData.get('remember_me'),
    callback_url: formData.get('callback_url'),
  })
  if (!validation.success) {
    return {
      state: {
        errors: z.flattenError(validation.error).fieldErrors,
        message: 'Missing or invalid fields.',
        status: 'failed',
      },
    }
  }

  const { email, password, remember_me, callback_url } = validation.data
  const core = await getCoreCommands()
  const result = await core.app.session.signInPassword(getCoreRequestContext(), {
    email,
    password,
    remember_me,
    ip_address: getRequestHeader('x-real-ip') ?? undefined,
  })
  if (!result.ok) {
    return { state: { errors: {}, message: 'We were unable to sign you in.', status: 'failed' } }
  }

  writeSession(result.data as TokenPair, 'user')
  return {
    state: { errors: {}, status: 'success' },
    redirectTo:
      callback_url != null && callback_url !== '/'
        ? safeCallbackPath(callback_url, '/dashboard?m=welcome')
        : '/dashboard?m=welcome',
  }
}

export const signInAdmin = async (
  formData: FormData
): Promise<SignInOutcome<AdminSignInFormState>> => {
  const validation = adminSignInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    remember_me: formData.get('remember_me'),
  })
  if (!validation.success) {
    return {
      state: {
        errors: z.flattenError(validation.error).fieldErrors,
        message: 'Missing or invalid fields.',
        status: 'failed',
      },
    }
  }

  const { email, password, remember_me } = validation.data
  const core = await getCoreCommands()
  const result = await core.admin.session.signInPassword(getCoreRequestContext(), {
    email,
    password,
    remember_me,
    ip_address: getRequestHeader('x-real-ip') ?? undefined,
  })
  if (!result.ok) {
    return { state: { errors: {}, message: 'We were unable to sign you in', status: 'failed' } }
  }

  writeSession(result.data as TokenPair, 'admin')
  // The Next action redirected to the decoded callbackUrl unvalidated (an open
  // redirect); the Start port keeps it on-site.
  const callback = formData.get('callbackUrl')?.toString()
  return {
    state: { errors: {}, status: 'success' },
    redirectTo: safeCallbackPath(callback != null ? decodeURIComponent(callback) : null, '/admin'),
  }
}

/** Clears the domain's session cookies. Core revocation arrives with the session hardening follow-on. */
export const signOutDomain = (domain: 'user' | 'admin'): { redirectTo: string } => {
  clearSession(domain)
  return { redirectTo: '/' }
}

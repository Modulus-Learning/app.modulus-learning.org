'use client'

import { useActionState } from 'react'

import { Button } from '@infonomic/uikit/react'

import { useTranslations } from '@/i18n/client'
import { LangLink } from '@/i18n/components/lang-link'
import { signOut } from '@/modules/app/session/password-auth'
import { useUserSession } from '@/modules/app/session/provider'
import type { Locale } from '@/i18n/i18n-config'

const initialState = ''

export const SignOut = ({ lng }: { lng: Locale }) => {
  const { t } = useTranslations('auth')
  const [_formState, formAction, _isPending] = useActionState(signOut, initialState)
  return (
    <form action={formAction} noValidate>
      <Button type="submit" variant="outlined" size="sm" className="px-2 sm:px-3 min-w-[60px]">
        {t('Sign Out')}
      </Button>
    </form>
  )
}

export const SignIn = ({ lng }: { lng: Locale }) => {
  const { t } = useTranslations('auth')
  return (
    <LangLink href="/sign-in" lng={lng}>
      <Button variant="outlined" size="sm">
        {t('Sign In')}
      </Button>
    </LangLink>
  )
}

export const SignInOut = ({ lng }: { lng: Locale }) => {
  const session = useUserSession()
  return session ? <SignOut lng={lng} /> : <SignIn lng={lng} />
}

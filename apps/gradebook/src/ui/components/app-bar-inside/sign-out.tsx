'use client'

import { useActionState } from 'react'

import { Button } from '@infonomic/uikit/react'

import { signOut } from '@/framework'
import { useTranslations } from '@/i18n/client'

const initialState = ''

export function SignOut({ lng }: { lng: string }) {
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

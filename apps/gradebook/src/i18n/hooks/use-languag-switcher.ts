'use client'

import { startTransition, useActionState } from 'react'
import { usePathname } from 'next/navigation'

import { type SetLanguageActionState, setLanguageAction } from '@/i18n/set-language-action'
import type { Locale } from '@/i18n/i18n-config'

interface UseLanguageSwitcherProps {
  initialLocale: Locale
}

export function useLanguageSwitcher({ initialLocale }: UseLanguageSwitcherProps) {
  const pathname = usePathname()
  const initialState: SetLanguageActionState = { message: undefined, status: 'idle' }
  const [state, dispatch] = useActionState(setLanguageAction, initialState)

  const switchLanguage = (lng: Locale) => {
    const data = new FormData()
    data.set('lng', lng)
    data.set('pathname', pathname)
    const search = window.location.search
    if (search) {
      // remove leading '?'
      data.set('searchParams', search.substring(1))
    }

    startTransition(() => {
      dispatch(data)
    })
  }

  return {
    switchLanguage,
    currentLocale: initialLocale,
    status: state.status,
    message: state.message,
  }
}

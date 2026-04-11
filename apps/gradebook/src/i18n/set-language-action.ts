'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { getLogger } from '@/lib/logger'
import { i18nConfig, type Locale } from './i18n-config'
import { pathWithoutLocale } from './utils'

export interface SetLanguageActionState {
  message?: string
  status: 'success' | 'failed' | 'idle'
}

export async function setLanguageAction(
  _prevState: SetLanguageActionState,
  formData: FormData
): Promise<SetLanguageActionState> {
  const logger = getLogger()
  const lng = formData.get('lng') as Locale
  const pathname = formData.get('pathname') as string
  const searchParams = formData.get('searchParams') as string

  if (lng != null && i18nConfig.locales.includes(lng) === true) {
    ;(await cookies()).set({
      name: i18nConfig.cookieName,
      value: lng,
      sameSite: 'lax',
      httpOnly: false,
      maxAge: 1704085200, // 365 days in the future for Chrome compatibility (max 400 days)
      path: '/',
    })

    let path = pathWithoutLocale(pathname)
    if (lng !== i18nConfig.defaultLocale) {
      path = `/${lng}${path}`
    }

    if (searchParams != null && searchParams.length > 0) {
      path += `?${searchParams}`
    }

    redirect(path)
  } else {
    const status: SetLanguageActionState = {
      status: 'failed',
      message: 'Error calling setLanguage - language value not found or invalid language value.',
    }
    logger.error({
      set_language: { ...status, method: 'setLanguage' },
    })
    return status
  }
}

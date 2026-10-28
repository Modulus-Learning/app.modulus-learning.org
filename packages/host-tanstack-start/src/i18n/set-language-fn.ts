import { createServerFn } from '@tanstack/react-start'

import { i18nConfig, type Locale } from '@/i18n/i18n-config'
import { neutralMiddleware } from '@/lib/server-fn'

/**
 * Persists the interface-language preference (spec: Internationalisation).
 * Replaces the Next `setLanguageAction`; the cookie keeps its name, `SameSite=Lax`
 * and non-HttpOnly flag, with a 365-day lifetime (the old value was seconds,
 * about 54 years, which browsers clamp to 400 days).
 */
export const setLanguageFn = createServerFn({ method: 'POST' })
  .middleware([neutralMiddleware])
  .validator((input: { lng: string }): { lng: Locale } => {
    if (!(i18nConfig.locales as readonly string[]).includes(input.lng)) {
      throw new Error(`Invalid locale: ${input.lng}`)
    }
    return input as { lng: Locale }
  })
  .handler(async ({ data }) => {
    const { setCookie } = await import('@tanstack/react-start/server')
    setCookie(i18nConfig.cookieName, data.lng, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    })
    return { lng: data.lng }
  })

import { useNavigate, useRouterState } from '@tanstack/react-router'

import { i18nConfig, type Locale } from '@/i18n/i18n-config'
import { setLanguageFn } from '@/i18n/set-language-fn'

/**
 * Locale-aware navigation for the TanStack Start host (spec:
 * Internationalisation; FORRU `use-locale-navigation.ts`, without its
 * content-locale layer). The locale is the required `$lng` path segment; clean
 * default-locale URLs come from the router's `rewrite.output`.
 */

const isLocale = (value: string): value is Locale =>
  (i18nConfig.locales as readonly string[]).includes(value)

/** The locale in the current URL (post `rewrite.input`, always present on localized routes). */
export function useLocale(): Locale {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const first = pathname.split('/')[1] ?? ''
  return isLocale(first) ? first : i18nConfig.defaultLocale
}

/** `'/about'` → `'/$lng/about'`, the typed route id the router matches. */
export function toLocaleRoute(path: string): string {
  if (path.startsWith('/$lng')) return path
  return path === '/' ? '/$lng' : `/$lng${path}`
}

/** `/es/about` → `/about`; `/es` → `/`; an unprefixed path is unchanged. */
export function stripLocalePrefix(pathname: string): string {
  for (const locale of i18nConfig.locales) {
    if (pathname === `/${locale}`) return '/'
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1)
  }
  return pathname
}

export function useLocaleNavigation() {
  const navigate = useNavigate()
  const currentLocale = useLocale()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  /** Navigate within the localized tree, persisting a changed locale first. */
  const navigateWithLocale = async ({
    to,
    locale = currentLocale,
    params = {},
    replace = false,
  }: {
    to: string
    locale?: Locale
    params?: Record<string, string | undefined>
    replace?: boolean
  }) => {
    if (locale !== currentLocale) await setLanguageFn({ data: { lng: locale } })
    await navigate({ to: toLocaleRoute(to), params: { ...params, lng: locale } as never, replace })
  }

  /** Switch the interface language on the current page. */
  const switchLocale = async (locale: Locale) => {
    if (locale === currentLocale) return
    await setLanguageFn({ data: { lng: locale } })
    const clean = stripLocalePrefix(pathname)
    await navigate({
      to: locale === i18nConfig.defaultLocale ? clean : `/${locale}${clean === '/' ? '' : clean}`,
    })
  }

  return { navigate: navigateWithLocale, switchLocale, currentLocale }
}

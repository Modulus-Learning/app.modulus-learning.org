'use client'

import { startTransition, useActionState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { useCookies } from 'react-cookie'

import { useProgress } from '@/context/progress-bar-provider'
import { i18nConfig, type Locale } from '@/i18n/i18n-config'
import { type SetLanguageActionState, setLanguageAction } from '@/i18n/set-language-action'
import { localeFromPath, pathWithoutLocale } from '@/i18n/utils'

interface NavigateOptions {
  href: string
  locale?: Locale
  replace?: boolean
  scroll?: boolean
  smoothScrollToTop?: boolean
}

export const useLangNavigation = (lng: Locale) => {
  const [cookies] = useCookies([i18nConfig.cookieName])
  const initialState: SetLanguageActionState = { message: undefined, status: 'idle' }
  const [_, dispatch] = useActionState(setLanguageAction, initialState)
  const router = useRouter()
  const startProgress = useProgress()
  // Note: pathname will include the locale!
  const pathname = usePathname()

  /**
   * getHref helper method will prepare the final path for
   * the client router including the locale if not the default.
   *
   * We don't need to append the default locale to a client route
   * as our current locale system removes this locale from URLs
   * creating clean URLs for the default language.
   *
   * We have special syntax that allows an href to be a dot (.)
   * which means the current path, or the href to begin with
   * a question mark (?) which means the current path plus query
   * string values. These are useful for cases like pagination,
   * where page 1 should be a canonical URL - with no query string
   * values (like ?page=2, ?page=3 etc.)
   *
   * We can also handle the case where there is a requested change
   * in locale via the locale param if provided, otherwise we'll
   * prepare the href based on the current locale (default language
   * or not)
   *
   * @param {string} href
   * @param {string} locale
   * @returns {string}
   */
  const getHref = (href: string, locale?: string): string => {
    let h = `${href}` // clone href

    // Set the requested locale to either the locale parameter,
    // or the current locale
    const requestedLocale = locale ?? lng

    // Handle all cases...
    if (h.startsWith('?') === true) {
      // 1. We have a query string only. If we're not in the default
      // locale - append the pathname which will include the
      // current locale, otherwise just pass the querystring on
      // to be used in the client router.
      if (requestedLocale === lng) {
        // There's no locale change - so build h with pathname (which includes current locale)
        // the client router accepts query string only values so h is fine for the default
        // locale on the current path.
        h = requestedLocale !== i18nConfig.defaultLocale ? `${pathname}${h}` : h
      } else {
        // There's a locale change - so build h with requested locale.
        // Remove the current locale from pathname
        const withoutLocale = pathWithoutLocale(pathname)
        h =
          requestedLocale !== i18nConfig.defaultLocale
            ? `/${requestedLocale}${withoutLocale}${h}`
            : `/${withoutLocale}${h}`
      }
    } else if (h === '.') {
      // 2. href with a dot which means the current path.
      // This is special syntax for things like our router-pager to force
      // a navigation to the current path WITHOUT any querystring params
      // i.e. going back to page 1 without page 1 in the querystring
      // in order to create a canonical URL for page 1
      // Again - the pathname will contain the locale if there is one.
      if (requestedLocale === lng) {
        h = pathname // we're done
      } else {
        // There's a locale change - so build h with requested locale
        const withoutLocale = pathWithoutLocale(pathname)
        h =
          requestedLocale !== i18nConfig.defaultLocale
            ? `/${requestedLocale}${withoutLocale}`
            : withoutLocale
      }
    } else if (h.startsWith('/') === true) {
      // 3. the href started with a forward slash - relative path
      // and we never supply the locale to href in LangLink (it's passed
      // via the lng prop) so go ahead and append the locale if needed
      // this works whether there is a locale change or not
      h = requestedLocale !== i18nConfig.defaultLocale ? `/${requestedLocale}${h}` : h
    } else {
      // 4. href didn't start with a forward slash, or a dot, or a ?
      // so build the new path with locale.
      // this works whether there is a locale change or not
      h = requestedLocale !== i18nConfig.defaultLocale ? `/${requestedLocale}/${h}` : `/${h}`
    }

    return h
  }

  // If the requested language is NOT the current language in the
  // lng cookie, it means the user is visiting a link that is specifically
  // asking for a change in language - for example, a page that includes links
  // to different language versions of the page. /es/mypage /fr/mypage etc.
  // and so instead of a client router event, we need to call our
  // server action - setLanguageAction
  const navigate = ({
    href,
    locale,
    replace = false,
    scroll = true,
    smoothScrollToTop = false,
  }: NavigateOptions) => {
    const h = getHref(href, locale)
    const requestedLocale = localeFromPath(h) as string
    if (
      cookies[i18nConfig.cookieName] == null ||
      (cookies[i18nConfig.cookieName] != null && cookies[i18nConfig.cookieName] === requestedLocale)
    ) {
      // If there is no cookie, or if the cookie matches the
      // requested locale - we can perform a 'normal' router
      // navigation
      startTransition(() => {
        startProgress()
        if (replace) {
          router.replace(h, { scroll: scroll })
        } else {
          router.push(h, { scroll: scroll })
        }
      })
      if (smoothScrollToTop) {
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        })
      }
    } else {
      // The only way we can arrive here, is if there is a cookie and
      // it does not match the requested locale in href, in which case
      // we call our setLanguageAction for the requested locale which will
      // reset the cookie and then redirect to the requested path.
      // After setLanguageAction - the cookie and requested locale will
      // be back in sync.
      const data = new FormData()
      data.set('lng', requestedLocale)
      data.set('pathname', h)
      startTransition(() => {
        startProgress()
        dispatch(data)
      })
    }
  }

  return { navigate, getHref }
}

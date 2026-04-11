import { NextResponse } from 'next/server'

import { i18nConfig } from '@/i18n/i18n-config'
import { getLocale } from './get-locale'
import type { ProxyLayer } from '../@types'

export const withI18n: ProxyLayer = (next) => {
  return async (request, event, context) => {
    const pathname = request.nextUrl.pathname
    const locale = getLocale(request)
    const localeInPath = i18nConfig.locales.find((locale) => {
      return pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
    })

    // Locale is NOT in the path
    if (localeInPath == null) {
      // Used for either a rewrite, or redirect in the case of the default
      // language. Also ensure that any query string values are preserved
      // via request.nextUrl.search
      let path = `/${locale}${pathname.startsWith('/') ? '' : '/'}${pathname}`
      if (request.nextUrl?.search != null) {
        path += request.nextUrl.search
      }
      if (locale === i18nConfig.defaultLocale) {
        // Default language - so leave it out of the visible browser URL,
        // but rewrite for Next.js locale params support.
        return NextResponse.rewrite(new URL(path, request.url), { request })
      }
      // NOT the default language - so redirect with the new 'locale'
      // containing URL.
      return NextResponse.redirect(new URL(path, request.url))
    }
    // We have a locale in the URL, so check to see it matches
    // the detected locale from getLocale above.
    if (localeInPath !== locale) {
      // There's a mismatch
      let path: string
      if (locale === i18nConfig.defaultLocale) {
        path = pathname.includes(`/${localeInPath}/`)
          ? pathname.replace(`/${localeInPath}`, '')
          : pathname.replace(`/${localeInPath}`, '/')
        if (request.nextUrl?.search != null) {
          path += request.nextUrl.search
        }
      } else {
        path = pathname.includes(`/${localeInPath}/`)
          ? pathname.replace(`/${localeInPath}`, locale)
          : pathname.replace(`/${localeInPath}`, `/${locale}`)
        if (request.nextUrl?.search != null) {
          path += request.nextUrl.search
        }
      }
      return NextResponse.redirect(new URL(path, request.url))
    }
    return next(request, event, context)

    // // TODO: Finally - check if there is a locale in the referer, and if so set the
    // // response cookie to this locale
    // if (request.headers.has('referer')) {
    //   const refererUrl = new URL(request.headers.get('referer') as string)
    //   const lngInReferer = locales.find((l) => refererUrl.pathname.startsWith(`/${l}`))
    //   if (lngInReferer != null) result.response.cookies.set(cookieName, lngInReferer)
    // }
  }
}

import { NextResponse } from 'next/server'

import { i18nConfig } from '@/i18n/i18n-config'
import { getLocale } from './withI18n/get-locale'
import type { UserSession } from '@/modules/app/session/@types'
import type { ProxyLayer } from './@types'

const routes = {
  dashboard: 'access_dashboard',
  account: 'account:read_own',
}

function containsProtected(value: string) {
  return Object.keys(routes).some((route) => {
    const regex = new RegExp(`^(\\/[a-zA-Z]{2})?\\/${route}(\\/.*)?$`)
    return regex.test(value)
  })
}

function allowedProtected(session: any, pathname: string) {
  for (const [route, ability] of Object.entries(routes)) {
    const regex = new RegExp(`^(\\/[a-zA-Z]{2})?\\/${route}(\\/.*)?$`)
    if (regex.test(pathname)) {
      return session?.abilities?.some((userAbility: string) => userAbility === ability)
    }
  }
  return false
}

export const withUserAuth: ProxyLayer = (next) => {
  return async (request, event, context) => {
    const session: UserSession | undefined = context.userSession

    const { pathname } = request.nextUrl
    const isProtectedRoute = containsProtected(pathname)
    const canAccessProtectedRoute = allowedProtected(session, pathname)

    if (!canAccessProtectedRoute && isProtectedRoute) {
      const locale = getLocale(request)
      if (session != null) {
        // TODO - create a 403 page
        const url = locale === i18nConfig.defaultLocale ? '/' : `/${locale}`
        return NextResponse.redirect(new URL(url, request.url))
      }
      const localePrefix = locale === i18nConfig.defaultLocale ? '' : `/${locale}`
      const url = `${localePrefix}/sign-in?callbackUrl=${encodeURIComponent(pathname)}`
      return NextResponse.redirect(new URL(url, request.url))
    }

    return next(request, event, context)
  }
}

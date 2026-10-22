import type React from 'react'
import { Link } from '@tanstack/react-router'

import { toLocaleRoute, useLocale } from '@/i18n/hooks/use-locale-navigation'
import type { Locale } from '@/i18n/i18n-config'

/**
 * Locale-aware link for the TanStack Start host: injects the required `$lng`
 * param from the current (or given) locale. The default locale's clean href
 * comes from the router's `rewrite.output`. Named `.start.tsx` until the Next
 * `lang-link.tsx` is removed in Task 18.
 */
export interface LangLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** A clean path such as `/about`, never `/$lng/about`. */
  to: string
  lng?: Locale
  params?: Record<string, string | undefined>
  search?: Record<string, unknown>
  replace?: boolean
  preload?: 'intent' | 'viewport' | 'render' | false
}

export function LangLink({
  to,
  lng,
  params,
  search,
  replace,
  preload,
  children,
  ...rest
}: LangLinkProps) {
  const current = useLocale()
  return (
    <Link
      {...rest}
      to={toLocaleRoute(to) as never}
      params={{ ...params, lng: lng ?? current } as never}
      search={search as never}
      replace={replace}
      preload={preload}
    >
      {children}
    </Link>
  )
}

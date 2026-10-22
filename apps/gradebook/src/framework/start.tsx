import type React from 'react'
import { useCallback, useMemo } from 'react'
import {
  Link as RouterLink,
  useRouterState,
  useRouter as useTanStackRouter,
} from '@tanstack/react-router'

import { i18nConfig, type Locale } from '@/i18n/i18n-config'
import { localeOutputRewrite } from '@/i18n/locale-rewrite'
import { setLanguageFn } from '@/i18n/set-language-fn'
import { localeFromPath, pathWithoutLocale } from '@/i18n/utils'

/**
 * TanStack Start implementation of the framework adapter (see `./index.ts`).
 * Signatures match the Next exports the shared components use; behaviour
 * follows the Next host's URL rules (visible URLs carry a locale prefix only
 * for non-default locales).
 */

/** The visible (public) pathname: the router's internal path minus the default locale. */
export function usePathname(): string {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return localeOutputRewrite(new URL(pathname, 'http://internal')).pathname
}

export function useSearchParams(): URLSearchParams {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr })
  return useMemo(() => new URLSearchParams(searchStr), [searchStr])
}

export function useRouter() {
  const router = useTanStackRouter()
  return useMemo(
    () => ({
      push: (href: string, options?: { scroll?: boolean }) =>
        router.navigate({ href, resetScroll: options?.scroll ?? true }),
      replace: (href: string, options?: { scroll?: boolean }) =>
        router.navigate({ href, replace: true, resetScroll: options?.scroll ?? true }),
      refresh: () => router.invalidate(),
      back: () => router.history.back(),
      prefetch: (href: string) => router.preloadRoute({ href } as never),
    }),
    [router]
  )
}

interface NavigateOptions {
  href: string
  locale?: Locale
  replace?: boolean
  scroll?: boolean
  smoothScrollToTop?: boolean
}

/**
 * Locale-aware navigation with the Next hook's `getHref` rules: `?query`
 * (current path + query), `.` (current path, no query), `/path` and `path`
 * (prefixed with the target locale unless it is the default).
 */
export function useLangNavigation(lng: Locale) {
  const router = useTanStackRouter()
  const pathname = usePathname()

  const getHref = useCallback(
    (href: string, locale?: string): string => {
      const target = locale ?? lng
      const prefix = target !== i18nConfig.defaultLocale ? `/${target}` : ''
      if (href.startsWith('?')) {
        return target === lng
          ? `${pathname}${href}`
          : `${prefix}${pathWithoutLocale(pathname)}${href}`
      }
      if (href === '.') {
        return target === lng ? pathname : `${prefix}${pathWithoutLocale(pathname)}` || '/'
      }
      if (href.startsWith('/')) return `${prefix}${href}`
      return `${prefix}/${href}`
    },
    [lng, pathname]
  )

  const navigate = useCallback(
    async ({
      href,
      locale,
      replace = false,
      scroll = true,
      smoothScrollToTop,
    }: NavigateOptions) => {
      const h = getHref(href, locale)
      const requested = localeFromPath(h) as Locale
      // A link to another language persists the choice first, as the Next
      // host's setLanguageAction did.
      if (requested !== lng) await setLanguageFn({ data: { lng: requested } })
      await router.navigate({ href: h, replace, resetScroll: scroll })
      if (smoothScrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [getHref, lng, router]
  )

  return { navigate, getHref }
}

export interface LangLinkProps {
  href: string
  lng?: Locale
  forceReload?: boolean
  scroll?: boolean
  smoothScrollToTop?: boolean
  replace?: boolean
  useOnPointerDown?: boolean
  children?: React.ReactNode
  [key: string]: any
}

export function LangLink({
  href,
  children,
  lng = i18nConfig.defaultLocale,
  forceReload,
  smoothScrollToTop,
  scroll = true,
  replace = false,
  useOnPointerDown = false,
  prefetch: _prefetch,
  ref,
  ...rest
}: LangLinkProps & { ref?: React.Ref<HTMLAnchorElement> }) {
  const { navigate, getHref } = useLangNavigation(lng)
  const h = getHref(href)

  if (forceReload === true) {
    return (
      <a href={h} ref={ref} {...rest}>
        {children}
      </a>
    )
  }

  const handleTransition = (event: React.SyntheticEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    void navigate({ href, replace, scroll, smoothScrollToTop })
  }
  const handlers = useOnPointerDown
    ? { onPointerDown: handleTransition }
    : { onClick: handleTransition }

  return (
    <a href={h} ref={ref} {...handlers} {...rest}>
      {children}
    </a>
  )
}

/** Plain (non-localized) link, as `next/link` is used in shared components. */
export function Link({
  href,
  children,
  prefetch: _prefetch,
  scroll: _scroll,
  replace,
  ref,
  ...rest
}: {
  href: string
  children?: React.ReactNode
  prefetch?: boolean
  scroll?: boolean
  replace?: boolean
  ref?: React.Ref<HTMLAnchorElement>
  [key: string]: any
}) {
  return (
    <RouterLink to={href as never} replace={replace} ref={ref} {...rest}>
      {children}
    </RouterLink>
  )
}

type StaticImage = { src: string; width?: number; height?: number }

/**
 * `next/image` stand-in: a plain <img> with explicit dimensions. The ~10 uses
 * are logos and heroes, which need no optimiser (spec: Next API replacement).
 */
export function Image({
  src,
  alt,
  width,
  height,
  priority,
  fill: _fill,
  quality: _quality,
  placeholder: _placeholder,
  sizes: _sizes,
  ...rest
}: {
  src: string | StaticImage
  alt: string
  width?: number
  height?: number
  priority?: boolean
  fill?: boolean
  quality?: number
  placeholder?: string
  sizes?: string
  [key: string]: any
}) {
  const resolved = typeof src === 'string' ? { src } : src
  return (
    <img
      src={resolved.src}
      alt={alt}
      width={width ?? resolved.width}
      height={height ?? resolved.height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...rest}
    />
  )
}

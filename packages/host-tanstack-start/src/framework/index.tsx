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
 * The navigation and image primitives the shared components use (`Link`,
 * `Image`, `useRouter`, `usePathname`, …), over TanStack Router. Their
 * signatures follow the Next APIs the components were written against, so the
 * migration left the components unchanged; visible URLs carry a locale prefix
 * only for non-default locales.
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

/** Interface-language switcher, as the Next `useLanguageSwitcher` hook exposes it. */
export function useLanguageSwitcher({ initialLocale }: { initialLocale: Locale }) {
  const router = useTanStackRouter()
  const pathname = usePathname()
  const switchLanguage = (lng: Locale) => {
    void (async () => {
      await setLanguageFn({ data: { lng } })
      const clean = pathWithoutLocale(pathname)
      const path = lng === i18nConfig.defaultLocale ? clean : `/${lng}${clean === '/' ? '' : clean}`
      await router.navigate({ href: `${path}${window.location.search}` })
    })()
  }
  return {
    switchLanguage,
    currentLocale: initialLocale,
    status: 'idle' as 'success' | 'failed' | 'idle',
    message: undefined as string | undefined,
  }
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

/*
 * Session actions, shaped like the Next server actions the shared forms pass to
 * `useActionState` — `(prevState, formData) => Promise<state>`. Each runs inside
 * the session coordination queue, tells other tabs on success, and navigates
 * with a full page load so the server renders the new session.
 */

type UserSignInState = import('@/modules/app/session/@types').SignInFormState
type AdminSignInState = import('@/modules/admin/session/@types').SignInFormState

const completeSignIn = async <TState,>(
  domain: 'user' | 'admin',
  run: () => Promise<{ state: TState; redirectTo?: string }>
): Promise<TState> => {
  const { coordinateAuthAction, notifySessionAction } = await import('@/lib/session/coordination')
  return coordinateAuthAction(domain, async () => {
    const { state, redirectTo } = await run()
    if (redirectTo != null) {
      notifySessionAction(domain)
      window.location.assign(redirectTo)
    }
    return state
  })
}

const completeSignOut = async (
  domain: 'user' | 'admin',
  run: () => Promise<{ redirectTo: string }>
): Promise<string> => {
  const { coordinateAuthAction, notifySessionAction } = await import('@/lib/session/coordination')
  return coordinateAuthAction(domain, async () => {
    const { redirectTo } = await run()
    notifySessionAction(domain)
    window.location.assign(redirectTo)
    return ''
  })
}

export async function signIn(_prev: UserSignInState, formData: FormData): Promise<UserSignInState> {
  const { signInUserFn } = await import('@/modules/app/session/sign-in')
  return completeSignIn('user', () => signInUserFn({ data: formData }))
}

export async function signOut(): Promise<string> {
  const { signOutUserFn } = await import('@/modules/app/session/sign-out')
  return completeSignOut('user', () => signOutUserFn())
}

export async function adminSignIn(
  _prev: AdminSignInState,
  formData: FormData
): Promise<AdminSignInState> {
  const { signInAdminFn } = await import('@/modules/admin/session/sign-in')
  return completeSignIn('admin', () => signInAdminFn({ data: formData }))
}

export async function adminSignOut(): Promise<string> {
  const { signOutAdminFn } = await import('@/modules/admin/session/sign-out')
  return completeSignOut('admin', () => signOutAdminFn())
}

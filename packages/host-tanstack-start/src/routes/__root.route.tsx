import type { ReactNode } from 'react'
import {
  createRootRoute,
  getRouteApi,
  HeadContent,
  Outlet,
  Scripts,
  useMatches,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'

import { DrawerProvider, ToastProvider, ToastViewport } from '@infonomic/uikit/react'

import { PublicConfigProvider } from '@/config/provider'
import { ProgressBarProvider } from '@/context/progress-bar-provider/index'
import { i18nConfig, type Locale } from '@/i18n/i18n-config'
import { getRootConfigFn } from '@/lib/public-config'
import { ConsoleCredit } from '@/ui/components/console-credit'
import { RouteAnnouncer } from '@/ui/components/route-announcer'
import { EarlyThemeDetector } from '@/ui/theme/early-theme-detector'
import { ThemeProviderBase } from '@/ui/theme/provider-base'

/**
 * Global style sheet, inside of which are uikit, tailwind, app and other
 * imports (one PostCSS pass instead of one per file).
 */
import '../ui/styles/global.css'

/** What an installation chooses about its document; everything else is Modulus. */
export interface RootRouteOptions {
  /** `apple-mobile-web-app-title`. */
  appTitle?: string
  /** Icon `<link>`s; defaults to the favicon set a Modulus host serves from `public/`. */
  icons?: Array<Record<string, string>>
  /** Plausible-compatible analytics, rendered when `ANALYTICS_ENABLED` is true. */
  analytics?: { domain: string; src: string; api: string }
}

const DEFAULT_ICONS = [
  { rel: 'icon', type: 'image/png', href: '/favicon-96x96.png', sizes: '96x96' },
  { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
  { rel: 'shortcut icon', href: '/favicon.ico' },
  { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
]

/**
 * The single document for a Modulus host. Each layout route declares
 * `staticData.themeContext` / `staticData.chrome` and the deepest match
 * decides, during render, so the attributes ship in SSR markup.
 */
export const createModulusRootRoute = (options: RootRouteOptions = {}) => {
  const { appTitle = 'Modulus', icons = DEFAULT_ICONS, analytics } = options

  // biome-ignore lint/suspicious/noExplicitAny: the host's route tree types its root
  const Route: any = createRootRoute({
    // Read once per full page load: these values cannot change during a session.
    loader: async () => ({ ...(await getRootConfigFn()), analytics: analytics ?? null }),
    staleTime: Number.POSITIVE_INFINITY,
    head: () => ({
      meta: [
        { charSet: 'UTF-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'apple-mobile-web-app-title', content: appTitle },
        { title: import.meta.env.VITE_SITE_NAME },
      ],
      links: icons,
    }),
    component: RootComponent,
  })

  return Route
}

const isLocale = (value: string): value is Locale =>
  (i18nConfig.locales as readonly string[]).includes(value)

function useDocumentContext() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const matches = useMatches()
  const first = pathname.split('/')[1] ?? ''
  const deepest = <K extends 'themeContext' | 'chrome'>(key: K) =>
    [...matches].reverse().find((match) => match.staticData?.[key] != null)?.staticData?.[key]
  return {
    lang: isLocale(first) ? first : i18nConfig.defaultLocale,
    themeContext: deepest('themeContext') ?? 'public',
    chrome: deepest('chrome') ?? 'full',
  }
}

const rootRoute = getRouteApi('__root__')

function RootComponent() {
  const { publicConfig, analyticsEnabled, analytics } = rootRoute.useLoaderData()
  return (
    <RootDocument analyticsEnabled={analyticsEnabled} analytics={analytics}>
      <PublicConfigProvider config={publicConfig}>
        <ThemeProviderBase>
          <ToastProvider timeout={5000}>
            <ProgressBarProvider>
              <DrawerProvider>
                <Outlet />
              </DrawerProvider>
            </ProgressBarProvider>
            <ToastViewport position="bottom-right" />
          </ToastProvider>
        </ThemeProviderBase>
      </PublicConfigProvider>
    </RootDocument>
  )
}

function RootDocument({
  analyticsEnabled,
  analytics,
  children,
}: {
  analyticsEnabled: boolean
  analytics: RootRouteOptions['analytics'] | null
  children: ReactNode
}) {
  const { lang, themeContext, chrome } = useDocumentContext()
  const nonce = useRouter().options.ssr?.nonce
  const chromeless = chrome === 'chromeless'

  return (
    <html
      lang={chromeless ? 'en' : lang}
      dir="ltr"
      suppressHydrationWarning
      className={chromeless ? 'light' : 'scroll-smooth'}
      style={chromeless ? { colorScheme: 'light' } : { scrollBehavior: 'smooth' }}
      data-scroll-behavior="smooth"
      data-theme-context={themeContext}
    >
      <head>
        {analytics != null && analyticsEnabled && !chromeless ? (
          <script
            async
            data-domain={analytics.domain}
            data-api={analytics.api}
            src={analytics.src}
            nonce={nonce}
          />
        ) : null}
        <EarlyThemeDetector nonce={nonce} />
        <HeadContent />
      </head>
      <body className={chromeless ? 'bg-gray-50 not-dark light' : 'bg-white dark:bg-canvas-900'}>
        {children}
        <RouteAnnouncer />
        <ConsoleCredit />
        <Scripts />
      </body>
    </html>
  )
}

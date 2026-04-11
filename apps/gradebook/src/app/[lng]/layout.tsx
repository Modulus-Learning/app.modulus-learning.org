// NOTE: Important - redirects in actions will not work if you are
// trying to redirect across route groups and there is no shared
// route layout.
// UPDATE: 2025-08-31 - this is now fixed. And so it's no longer
// necessary to have a shared layout across all route groups
// https://github.com/vercel/next.js/issues/58263

import { headers } from 'next/headers'

import type { Metadata, Viewport } from 'next'

import { getServerConfig } from '@/config'
import { getTranslations } from '@/i18n/server'
import { getMeta } from '@/lib/meta'
import { ConsoleCredit } from '@/ui/components/console-credit'
import { EarlyThemeDetector } from '@/ui/theme/early-theme-detector'
import { Providers } from './providers'
import type { Locale } from '@/i18n/i18n-config'

/**
 * Global style sheet, inside of which are uikit,
 * tailwind, app and other imports. Wrapping them in
 * global.css reduces the number of CSS postcss pipeline
 * iterations to one (as opposed to O(n)).
 */
import '@/ui/styles/global.css'

import { getAdminSession } from '@/modules/admin/session/storage'
import { getUserSession } from '@/modules/app/session/storage'

export async function generateViewport(): Promise<Viewport> {
  return {
    themeColor: '#050708',
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng)
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<'/[lng]'>): Promise<React.JSX.Element> {
  const { lng } = (await params) as { lng: Locale }
  const config = getServerConfig()
  const translations = await getTranslations(lng)
  const nonce = (await headers()).get('x-nonce') ?? ''
  const userSession = await getUserSession()
  const adminSession = await getAdminSession()

  return (
    <html
      lang={lng}
      dir="ltr"
      suppressHydrationWarning
      className="scroll-smooth"
      style={{ scrollBehavior: 'smooth' }}
      data-scroll-behavior="smooth"
    >
      <head>
        <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content="Modulus" />
        {config.analyticsEnabled && (
          <script
            async
            data-domain="modulus-learning.org"
            data-api="/modules/api/event"
            src="/modules/js/script.js"
            nonce={nonce}
          />
        )}
        <meta name="color-scheme" content="light dark" />
        <EarlyThemeDetector nonce={nonce} />
      </head>
      <body className="bg-white dark:bg-canvas-900">
        <Providers
          translations={translations}
          adminSession={adminSession}
          userSession={userSession}
        >
          {children}
        </Providers>
      </body>
      <ConsoleCredit />
    </html>
  )
}

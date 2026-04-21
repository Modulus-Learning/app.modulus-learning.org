import { ScrollToTop } from '@infonomic/uikit/react'
import { headers } from 'next/headers'
import type { Metadata, Viewport } from 'next'

import { getTranslations } from '@/i18n/server'
import { getMeta } from '@/lib/meta'
import { getUserSession } from '@/modules/app/session/storage'
import { UserSessionProvider } from '@/modules/app/session/provider'
import { AppBarInside } from '@/ui/components/app-bar-inside'
import { SiteFooter } from '@/ui/components/site-footer'
import { DocumentRoot } from '../root'
import { Providers } from '../providers'
import type { Locale } from '@/i18n/i18n-config'

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
  return await getMeta(lng, { title: 'Dashboard', description: 'Dashboard home...' })
}

export default async function AuthLayout({
  children,
  params,
}: LayoutProps<'/[lng]'>): Promise<React.JSX.Element> {
  const { lng } = (await params) as { lng: Locale }
  const translations = await getTranslations(lng)
  const nonce = (await headers()).get('x-nonce') ?? ''
  const userSession = await getUserSession()

  return (
    <DocumentRoot lng={lng} nonce={nonce} themeContext="protected">
      <Providers translations={translations}>
        <UserSessionProvider session={userSession}>
          <div className="layout-container root flex min-h-screen flex-col">
            <AppBarInside lng={lng} />
            <main id="main-content" className="flex flex-1 flex-col">
              {children}
            </main>
            <SiteFooter lng={lng} />
            <ScrollToTop />
          </div>
        </UserSessionProvider>
      </Providers>
    </DocumentRoot>
  )
}

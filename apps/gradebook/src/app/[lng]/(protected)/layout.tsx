import { ScrollToTop } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { AppBarInside } from '@/ui/components/app-bar-inside'
import { SiteFooter } from '@/ui/components/site-footer'
import type { Locale } from '@/i18n/i18n-config'

// cookies
// decrypt

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, { title: 'Dashboard', description: 'Dashboard home...' })
}

export default async function ProtectedLayout({
  children,
  params,
}: LayoutProps<'/[lng]'>): Promise<React.JSX.Element> {
  const { lng } = (await params) as { lng: Locale }
  return (
    <div className="layout-container root flex min-h-screen flex-col">
      <AppBarInside lng={lng} />
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter lng={lng} />
      <ScrollToTop />
    </div>
  )
}

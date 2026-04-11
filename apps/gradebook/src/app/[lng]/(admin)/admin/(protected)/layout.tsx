import { ScrollToTop } from '@infonomic/uikit/react'
import type { Metadata } from 'next'

import { getMeta } from '@/lib/meta'
import { AdminAppBar } from '@/ui/components/admin/admin-app-bar'
import { Content } from '@/ui/components/admin/content'
import { MenuDrawer } from '@/ui/components/admin/menu-drawer'
import { MenuProvider } from '@/ui/components/admin/menu-provider'
import type { Locale } from '@/i18n/i18n-config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<Metadata> {
  const { lng } = await params
  return await getMeta(lng, { title: 'Admin', description: 'Admin home...' })
}

export default async function AdminLayout({
  children,
  params,
}: LayoutProps<'/[lng]/admin'>): Promise<React.JSX.Element> {
  const { lng } = (await params) as { lng: Locale }
  return (
    <MenuProvider>
      <div className="layout-container root flex min-h-screen flex-col">
        <AdminAppBar lng={lng} />
        <main id="main-content" className="flex flex-1">
          <MenuDrawer lng={lng} />
          <Content>{children}</Content>
        </main>
        <ScrollToTop />
      </div>
    </MenuProvider>
  )
}

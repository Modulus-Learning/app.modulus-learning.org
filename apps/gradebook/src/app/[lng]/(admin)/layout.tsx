import { headers } from 'next/headers'

import type { Viewport } from 'next'

import { getTranslations } from '@/i18n/server'
import { assertSurfaceServed } from '@/lib/deployment-mode-guard'
import { AdminSessionProvider } from '@/modules/admin/session/provider'
import { getAdminSession } from '@/modules/admin/session/storage'
import { Providers } from '../providers'
import { DocumentRoot } from '../root'
import type { Locale } from '@/i18n/i18n-config'

export async function generateViewport(): Promise<Viewport> {
  return {
    themeColor: '#050708',
  }
}

export default async function AdminRootLayout({
  children,
  params,
}: LayoutProps<'/[lng]'>): Promise<React.JSX.Element> {
  // Defense-in-depth backup to the proxy gate: the admin surface is blocked on
  // frontend-only instances.
  assertSurfaceServed('admin')

  const { lng } = (await params) as { lng: Locale }
  const translations = await getTranslations(lng)
  const nonce = (await headers()).get('x-nonce') ?? ''
  const adminSession = await getAdminSession()

  return (
    <DocumentRoot lng={lng} nonce={nonce} themeContext="protected">
      <Providers translations={translations}>
        <AdminSessionProvider session={adminSession}>{children}</AdminSessionProvider>
      </Providers>
    </DocumentRoot>
  )
}

import { Outlet, useParams } from '@tanstack/react-router'

import { ScrollToTop } from '@infonomic/uikit/react'

import { AdminAppBar } from '@/ui/components/admin/admin-app-bar'
import { Content } from '@/ui/components/admin/content'
import { MenuDrawer } from '@/ui/components/admin/menu-drawer'
import { MenuProvider } from '@/ui/components/admin/menu-provider'
import { NotFoundView } from '@/ui/components/not-found-view'

function AdminChrome({ children }: { children: React.ReactNode }) {
  const { lng } = useParams({ strict: false })
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

function AdminLayout() {
  return (
    <AdminChrome>
      <Outlet />
    </AdminChrome>
  )
}

export const Page = AdminLayout

export const NotFound = () => (
  <AdminChrome>
    <NotFoundView />
  </AdminChrome>
)

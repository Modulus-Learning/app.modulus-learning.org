import { createRootRoute, Outlet } from '@tanstack/react-router'

import { SiteFooter } from '@/ui/components/site-footer'

function RootLayout() {
  return (
    <div className="site-layout flex flex-col min-h-screen">
      <Outlet />
      <SiteFooter />
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})

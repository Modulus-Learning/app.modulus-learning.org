import { createFileRoute, Outlet } from '@tanstack/react-router'

import { AppBar } from '@/ui/components/app-bar'

export const Route = createFileRoute('/_public')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <AppBar showResetButton={false} />
      <main id="main-content" className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </>
  )
}

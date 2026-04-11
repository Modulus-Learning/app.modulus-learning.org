import { createFileRoute, Outlet } from '@tanstack/react-router'

import { AppBar } from '@/ui/components/app-bar'
import { CourseLayoutProvider, useCourseLayout } from '@/ui/components/course-layout-provider'
import { ModulusProvider } from '@/ui/components/modulus-provider'

export const Route = createFileRoute('/_courses')({
  component: RouteComponent,
})

function CourseAppBar() {
  const { showResetButton } = useCourseLayout()
  return <AppBar showResetButton={showResetButton} />
}

function RouteComponent() {
  return (
    <CourseLayoutProvider>
      <ModulusProvider>
        <CourseAppBar />
        <main id="main-content" className="flex flex-1 flex-col">
          <Outlet />
        </main>
      </ModulusProvider>
    </CourseLayoutProvider>
  )
}

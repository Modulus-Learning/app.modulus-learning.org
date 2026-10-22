import { createFileRoute, Outlet } from '@tanstack/react-router'

// The admin surface's pathless layout. Task 14 adds the surface guard, admin
// session provider and chrome; for now it only hosts the renewal bootstrap.
export const Route = createFileRoute('/$lng/_admin')({
  staticData: { themeContext: 'protected' },
  component: Outlet,
})

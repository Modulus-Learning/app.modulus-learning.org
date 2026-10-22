import { createFileRoute, Outlet } from '@tanstack/react-router'

// Chromeless agent pages (the agent authorization error page).
export const Route = createFileRoute('/agent')({
  staticData: { chrome: 'chromeless' },
  head: () => ({ meta: [{ title: 'Modulus' }] }),
  component: Outlet,
})

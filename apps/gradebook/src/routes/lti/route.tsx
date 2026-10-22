import { createFileRoute, Outlet } from '@tanstack/react-router'

// Chromeless LTI pages (spec: Task 13), served in English and always light.
// The server entry's deployment-mode gate covers every request here.
export const Route = createFileRoute('/lti')({
  staticData: { chrome: 'chromeless' },
  head: () => ({
    meta: [{ title: 'Modulus' }, { name: 'description', content: 'Modulus Learning Platform' }],
  }),
  component: Outlet,
})

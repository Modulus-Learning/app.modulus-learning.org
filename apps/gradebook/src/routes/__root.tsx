import type { ReactNode } from 'react'
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'

import '@/ui/styles/global.css'

// Minimal root for the scaffold. Task 9 builds the real document: theme
// context, chrome variants, <html lang>, public config, analytics.
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'UTF-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { title: import.meta.env.VITE_SITE_NAME },
    ],
  }),
  component: () => (
    <Document>
      <Outlet />
    </Document>
  ),
})

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

import type { Metadata } from 'next'

import { assertSurfaceServed } from '@/lib/deployment-mode-guard'
import { EarlyThemeDetector } from '@/ui/theme/early-theme-detector'

export const metadata: Metadata = {
  title: 'Modulus',
  description: 'Modulus Learning Platform',
}

/**
 * Global style sheet, inside of which are uikit,
 * tailwind, app and other imports. Wrapping them in
 * global.css reduces the number of CSS postcss pipeline
 * iterations to one (as opposed to O(n)).
 */
import '@/ui/styles/global.css'

/**
 * Chromeless layout for LTI pages (deep-linking, launch, dynamic registration).
 * No header, footer, or navigation — just the page content.
 */
export default function LtiLayout({ children }: { children: React.ReactNode }) {
  // The /lti/* pages are excluded from the proxy matcher, so this guard is the
  // authoritative deployment-mode gate for the LTI surface (blocked in admin mode).
  assertSurfaceServed('frontend')

  return (
    <html lang="en" className="light" style={{ colorScheme: 'light' }} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <EarlyThemeDetector nonce="" />
      </head>
      <body className="bg-gray-50 not-dark light">{children}</body>
    </html>
  )
}

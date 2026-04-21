import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

import { getServerConfig } from '@/config'
import { ConsoleCredit } from '@/ui/components/console-credit'
import { EarlyThemeDetector } from '@/ui/theme/early-theme-detector'

/**
 * Global style sheet, inside of which are uikit,
 * tailwind, app and other imports. Wrapping them in
 * global.css reduces the number of CSS postcss pipeline
 * iterations to one (as opposed to O(n)).
 */
import '@/ui/styles/global.css'

type DocumentRootProps = {
  lng: string
  nonce?: string
  themeContext?: 'public' | 'protected'
  head?: ReactNode
  bodyClassName?: string
  bodyStyle?: CSSProperties
  children: ReactNode
  afterBody?: ReactNode
  htmlProps?: HTMLAttributes<HTMLHtmlElement>
}

export async function DocumentRoot({
  lng,
  nonce,
  themeContext = 'public',
  head,
  bodyClassName = 'bg-white dark:bg-canvas-900',
  bodyStyle,
  children,
  afterBody,
  htmlProps,
}: DocumentRootProps) {
  const config = getServerConfig()

  return (
    <html
      lang={lng}
      dir="ltr"
      suppressHydrationWarning
      className="scroll-smooth"
      style={{ scrollBehavior: 'smooth' }}
      data-scroll-behavior="smooth"
      data-theme-context={themeContext}
      {...htmlProps}
    >
      <head>
        <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content="Modulus" />
        {config.analyticsEnabled && (
          <script
            async
            data-domain="modulus-learning.org"
            data-api="/modules/api/event"
            src="/modules/js/script.js"
            nonce={nonce}
          />
        )}
        <meta name="color-scheme" content="light dark" />
        <EarlyThemeDetector nonce={nonce} />
        {head}
      </head>
      <body style={bodyStyle} className={bodyClassName}>
        {children}
        {afterBody}
      </body>
      <ConsoleCredit />
    </html>
  )
}

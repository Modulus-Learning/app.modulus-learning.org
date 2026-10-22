'use client'

import type React from 'react'

import { usePathname } from '@/framework'
import { ThemeProviderBase, type ThemeProviderBaseProps } from './provider-base'

export { useTheme } from './provider-base'

/**
 * The Next host's theme provider: re-applies the theme on every pathname
 * change, because a Next navigation can replace the <html> attributes set by
 * `EarlyThemeDetector`. Removed with the Next app in Task 18.
 */
export function ThemeProvider(props: Omit<ThemeProviderBaseProps, 'routeKey'>): React.JSX.Element {
  const pathname = usePathname()
  return <ThemeProviderBase {...props} routeKey={pathname} />
}

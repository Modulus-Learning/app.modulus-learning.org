'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Moves focus to the new page's `<h1>` after a client-side (SPA) navigation so
 * that keyboard and screen-reader users are placed into the updated content
 * instead of being left on the old link. Next.js's built-in route announcer
 * separately reads the (now per-page) document `<title>`; this complements it.
 *
 * - Skips the initial page load (a full load already announces the title).
 * - Keys off `usePathname()`, which excludes search params, so query-only
 *   updates (pagination, search, sorting) do not steal focus — only real page
 *   changes do.
 */
export function RouteFocusManager(): null {
  const pathname = usePathname()
  const isInitialRender = useRef(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger — the effect must re-run on each route change even though it doesn't read the value directly.
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }

    const heading = document.querySelector<HTMLHeadingElement>('#main-content h1')
    if (heading == null) return

    // -1 keeps the heading out of the tab order while allowing programmatic focus.
    if (!heading.hasAttribute('tabindex')) {
      heading.setAttribute('tabindex', '-1')
    }
    heading.focus()
  }, [pathname])

  return null
}

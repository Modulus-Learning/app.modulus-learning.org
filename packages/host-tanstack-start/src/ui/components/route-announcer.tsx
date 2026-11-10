import { useEffect, useRef, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'

// Visually hidden, but read by screen readers (the shape Next.js used).
const hidden: React.CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  width: '1px',
  whiteSpace: 'nowrap',
  overflowWrap: 'normal',
}

/**
 * Announces each client-side (SPA) navigation to screen readers, as Next.js's
 * built-in route announcer did before the migration (accessibility audit
 * finding 9). It keys off the router's *resolved* location, which changes only
 * once the destination has loaded and rendered — not when navigation starts —
 * so a slow loader cannot make it read the previous page. Rendered after the
 * page outlet, its effect runs after the destination's own effects in the same
 * commit, then reads the new `document.title`, falling back to the page's
 * `<h1>`, then to the path, into an assertive live region. The initial load,
 * which the browser announces itself, stays silent.
 */
export function RouteAnnouncer() {
  const resolved = useRouterState({ select: (state) => state.resolvedLocation?.href })
  const pathname = useRouterState({ select: (state) => state.resolvedLocation?.pathname })
  const [message, setMessage] = useState('')
  const lastPathname = useRef<string | undefined>(undefined)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `resolved` is the trigger — each completed navigation re-runs the effect.
  useEffect(() => {
    if (pathname == null) return
    const previous = lastPathname.current
    lastPathname.current = pathname
    // The first resolved location is the initial load; query-only changes
    // (pagination, sorting) are not page changes.
    if (previous == null || previous === pathname) return
    setMessage(document.title || document.querySelector('h1')?.textContent?.trim() || pathname)
  }, [resolved, pathname])

  return (
    <p aria-live="assertive" role="alert" id="route-announcer" style={hidden}>
      {message}
    </p>
  )
}

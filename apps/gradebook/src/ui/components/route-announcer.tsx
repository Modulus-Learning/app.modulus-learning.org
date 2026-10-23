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
 * finding 9). After a path change — not the initial load, which the browser
 * announces itself — it reads the new page's `document.title`, falling back to
 * its `<h1>`, then to the path, into an assertive live region.
 */
export function RouteAnnouncer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [message, setMessage] = useState('')
  const isInitialRender = useRef(true)

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    // The new page's head (title) is applied after it renders.
    const timer = window.setTimeout(() => {
      setMessage(document.title || document.querySelector('h1')?.textContent?.trim() || pathname)
    }, 50)
    return () => window.clearTimeout(timer)
  }, [pathname])

  return (
    <p aria-live="assertive" role="alert" id="route-announcer" style={hidden}>
      {message}
    </p>
  )
}

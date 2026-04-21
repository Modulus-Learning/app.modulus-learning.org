'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

import { UserSessionContext } from './provider'
import type { UserSession } from './@types'

const GET_USER_SESSION_URL = '/routes/auth/session'

/**
 * Client-only user session provider.
 *
 * Populates the same UserSessionContext as the server-fetched `UserSessionProvider`
 * so existing `useUserSession()` consumers work unchanged. Fetches the session on
 * mount and whenever the pathname changes, letting ISR-cached pages (e.g. /about,
 * /docs) render signed-in chrome without forcing the page itself to be dynamic.
 */
export const ClientUserSessionProvider = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname()
  const [session, setSession] = useState<UserSession | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname
  useEffect(() => {
    const ac = new AbortController()

    async function load() {
      try {
        const res = await fetch(GET_USER_SESSION_URL, {
          method: 'GET',
          credentials: 'include',
          signal: ac.signal,
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })
        if (!res.ok) {
          setSession(null)
          return
        }
        const data = (await res.json()) as UserSession | null
        setSession(data ?? null)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSession(null)
      }
    }

    load()
    return () => {
      ac.abort()
    }
  }, [pathname])

  return <UserSessionContext.Provider value={session}>{children}</UserSessionContext.Provider>
}

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import { createPortal } from 'react-dom'

import {
  sessionIsChanged,
  setExpectedPrincipal,
  startSessionNotifications,
  subscribeSessionChange,
} from './coordination'
import type { SessionDomain } from './principal'

// Module-level default keeps the prop referentially stable.
const reloadPage = () => window.location.reload()

/**
 * Records the principal this page was rendered for (spec: Authentication And
 * Sessions, item 7), from the layout's own loader data, and starts listening
 * for sign-in/sign-out notices from other tabs.
 *
 * When the session changes under the page — another tab signed in or out, or
 * the server answered `changed` to a call — it renders the session-changed
 * interstitial (review R8): a blocking dialog that makes the rest of the page
 * inert, so a stale form cannot be submitted, and offers a reload. A reload is
 * a plain GET of the page; nothing is resubmitted.
 */
export function SessionIdentity({
  domain,
  userId,
  reload = reloadPage,
}: {
  domain: SessionDomain
  userId: string | null
  reload?: () => void
}) {
  useEffect(() => {
    setExpectedPrincipal(domain, userId != null ? { domain, userId } : null)
    startSessionNotifications(domain)
  }, [domain, userId])

  const subscribe = useCallback(
    (listener: () => void) => subscribeSessionChange(domain, listener),
    [domain]
  )
  const changed = useSyncExternalStore(
    subscribe,
    () => sessionIsChanged(domain),
    () => false
  )

  return changed ? <SessionChangedInterstitial reload={reload} /> : null
}

function SessionChangedInterstitial({ reload }: { reload: () => void }) {
  const button = useRef<HTMLButtonElement>(null)

  // Everything else on the page becomes inert while the dialog is up.
  useEffect(() => {
    const host = button.current?.closest('[data-session-changed]')
    const others = [...document.body.children].filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== host
    )
    const alreadyInert = others.map((element) => element.hasAttribute('inert'))
    for (const element of others) element.setAttribute('inert', '')
    button.current?.focus()
    return () => {
      others.forEach((element, index) => {
        if (!alreadyInert[index]) element.removeAttribute('inert')
      })
    }
  }, [])

  return createPortal(
    <div
      data-session-changed=""
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-changed-title"
        aria-describedby="session-changed-description"
        className="max-w-md rounded bg-white p-6 shadow-lg dark:bg-canvas-800"
      >
        <h2 id="session-changed-title" className="text-xl font-semibold">
          Your session has changed
        </h2>
        <p id="session-changed-description" className="mt-2">
          You are now signed in as a different account, or signed out, in another window. Reload the
          page to continue.
        </p>
        <button ref={button} type="button" className="mt-4 underline" onClick={reload}>
          Reload
        </button>
      </div>
    </div>,
    document.body
  )
}

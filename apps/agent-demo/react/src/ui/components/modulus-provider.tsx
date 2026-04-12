import { createContext, useContext, useEffect, useMemo } from 'react'
import { useRouterState } from '@tanstack/react-router'

import { ModulusAgent } from '@modulus-learning/agent'
import { type ModulusWidgetPosition, setupModulusAvatar } from '@modulus-learning/agent/ui/vanilla'

const ModulusContext = createContext<ModulusAgent | null>(null)

interface Props {
  children: React.ReactNode
  widgetPosition?: ModulusWidgetPosition
}

export const ModulusProvider: React.FC<Props> = ({ children, widgetPosition = 'bottom-right' }) => {
  // TEMPORARY: The agent's auth token is currently bound server-side to the
  // activity URL it was first authenticated against, so a single agent instance
  // can only read/write progress for one activity. Until the server is updated
  // to resolve the activity per-request, we work around this by dropping the
  // agent and re-authenticating from scratch whenever the SPA route changes.
  // See discussion on navigation reactivity in the agent widget plan.
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // biome-ignore lint/correctness/useExhaustiveDependencies: we monitor pathname.
  const modulus = useMemo(() => new ModulusAgent(), [pathname])

  useEffect(() => {
    const handle = setupModulusAvatar(modulus, { position: widgetPosition })
    return () => handle.destroy()
  }, [modulus, widgetPosition])

  return <ModulusContext.Provider value={modulus}>{children}</ModulusContext.Provider>
}

export const useModulus = () => {
  const modulus = useContext(ModulusContext)
  if (!modulus) {
    throw new Error('useModulus must be used within a ModulusProvider')
  }
  return { modulus }
}

import { createContext, type ReactNode, useContext } from 'react'

import { getPublicConfig, type PublicConfig } from '.'

export const PublicConfigContext = createContext<PublicConfig | null>(null)

/**
 * The Next host reads the public config from its build-time env; the TanStack
 * Start host passes the value its root loader resolved on the server, so the
 * public server URL is correct per instance (spec: Deployment Modes item 3).
 */
export const PublicConfigProvider = ({
  children,
  config,
}: {
  children: ReactNode
  config?: PublicConfig
}) => (
  <PublicConfigContext.Provider value={config ?? getPublicConfig()}>
    {children}
  </PublicConfigContext.Provider>
)

/**
 * The public config from the nearest provider. Without one (the Next LTI
 * layout renders none) it falls back to the Next host's build-time env; the
 * TanStack Start root always provides it, from the server.
 */
export const usePublicConfig = (): PublicConfig =>
  useContext(PublicConfigContext) ?? getPublicConfig()

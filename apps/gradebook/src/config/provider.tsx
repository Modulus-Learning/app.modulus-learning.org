'use client'

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

export const usePublicConfig = () => {
  const context = useContext(PublicConfigContext)
  if (context != null) {
    return context
  }
  throw new Error('usePublicConfig must be used within a PublicConfigProvider')
}

'use client'

import { createContext, type ReactNode, useContext } from 'react'

import { getPublicConfig, type PublicConfig } from '.'

export const PublicConfigContext = createContext<PublicConfig | null>(null)

export const PublicConfigProvider = ({ children }: { children: ReactNode }) => {
  const config = getPublicConfig()
  return <PublicConfigContext.Provider value={config}>{children}</PublicConfigContext.Provider>
}

export const usePublicConfig = () => {
  const context = useContext(PublicConfigContext)
  if (context != null) {
    return context
  }
  throw new Error('usePublicConfig must be used within a PublicConfigProvider')
}

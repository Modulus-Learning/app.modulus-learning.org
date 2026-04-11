import { createContext, useContext, useRef } from 'react'

import { ModulusAgent } from '@modulus-learning/agent'

const ModulusContext = createContext<ModulusAgent | null>(null)

interface Props {
  children: React.ReactNode
}

export const ModulusProvider: React.FC<Props> = ({ children }) => {
  const modulusRef = useRef<ModulusAgent>(null)

  if (modulusRef.current == null) {
    const modulus = new ModulusAgent()
    modulusRef.current = modulus
  }

  return <ModulusContext.Provider value={modulusRef.current}>{children}</ModulusContext.Provider>
}

export const useModulus = () => {
  const modulus = useContext(ModulusContext)
  if (!modulus) {
    throw new Error('useModulus must be used within a ModulusProvider')
  }
  return { modulus }
}

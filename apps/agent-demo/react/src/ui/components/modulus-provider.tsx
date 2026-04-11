import { createContext, useContext, useEffect, useRef } from 'react'

import { ModulusAgent } from '@modulus-learning/agent'
import { type ModulusWidgetPosition, setupModulusAvatar } from '@modulus-learning/agent/ui/vanilla'

const ModulusContext = createContext<ModulusAgent | null>(null)

interface Props {
  children: React.ReactNode
  widgetPosition?: ModulusWidgetPosition
}

export const ModulusProvider: React.FC<Props> = ({ children, widgetPosition = 'bottom-right' }) => {
  const modulusRef = useRef<ModulusAgent>(null)

  if (modulusRef.current == null) {
    const modulus = new ModulusAgent()
    modulusRef.current = modulus
  }

  useEffect(() => {
    if (modulusRef.current == null) return
    const handle = setupModulusAvatar(modulusRef.current, { position: widgetPosition })
    return () => handle.destroy()
  }, [widgetPosition])

  return <ModulusContext.Provider value={modulusRef.current}>{children}</ModulusContext.Provider>
}

export const useModulus = () => {
  const modulus = useContext(ModulusContext)
  if (!modulus) {
    throw new Error('useModulus must be used within a ModulusProvider')
  }
  return { modulus }
}

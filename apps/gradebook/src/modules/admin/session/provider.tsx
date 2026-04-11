'use client'

import { createContext, type ReactNode, useContext } from 'react'

import type { AdminSession } from './@types'

const AdminSessionContext = createContext<AdminSession | null>(null)

export const AdminSessionProvider = ({
  session,
  children,
}: {
  session: AdminSession | null
  children: ReactNode
}) => {
  return <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>
}

export const useAdminSession = () => {
  // NOTE:  We don't assert that this is called within the
  // AdminSessionProvider, as undefined means that the session is not available
  return useContext(AdminSessionContext)
}

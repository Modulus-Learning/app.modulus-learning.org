'use client'

import { createContext, type ReactNode, useContext } from 'react'

import type { UserSession } from './@types'

const UserSessionContext = createContext<UserSession | null>(null)

export const UserSessionProvider = ({
  session,
  children,
}: {
  session: UserSession | null
  children: ReactNode
}) => {
  return <UserSessionContext.Provider value={session}>{children}</UserSessionContext.Provider>
}

export const useUserSession = () => {
  // NOTE:  We don't assert that this is called within the
  // UserSessionProvider, as undefined means that the session is not available
  return useContext(UserSessionContext)
}

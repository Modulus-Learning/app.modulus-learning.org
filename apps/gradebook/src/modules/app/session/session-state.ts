import { createServerFn } from '@tanstack/react-start'

import type { UserSession } from '@modulus-learning/core'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'

export interface UserSessionSnapshot {
  session: UserSession | null
  /** The access token has expired but a refresh cookie is present (see SessionRecovery). */
  renewable: boolean
}

/** The learner session for layout loaders: verification-only, never rotates. */
export const getUserSessionFn = createServerFn({ method: 'GET' })
  .middleware([frontendSurfaceMiddleware])
  .handler(async (): Promise<UserSessionSnapshot> => {
    const { getUserSessionState } = await import('@/lib/session/context')
    const state = await getUserSessionState()
    return {
      session: state.status === 'valid' ? state.session : null,
      renewable: state.status === 'renewable',
    }
  })

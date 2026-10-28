import { createServerFn } from '@tanstack/react-start'

import type { AdminSession } from '@modulus-learning/core'

import { adminSurfaceMiddleware } from '@/lib/server-fn'

export interface AdminSessionSnapshot {
  session: AdminSession | null
  /** The access token has expired but a refresh cookie is present. */
  renewable: boolean
}

/** The admin session for layout guards and loaders: verification-only, never rotates. */
export const getAdminSessionFn = createServerFn({ method: 'GET' })
  .middleware([adminSurfaceMiddleware])
  .handler(async (): Promise<AdminSessionSnapshot> => {
    const { getAdminSessionState } = await import('@/lib/session/context')
    const state = await getAdminSessionState()
    return {
      session: state.status === 'valid' ? state.session : null,
      renewable: state.status === 'renewable',
    }
  })

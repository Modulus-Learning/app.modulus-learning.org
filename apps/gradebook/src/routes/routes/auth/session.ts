import { createFileRoute } from '@tanstack/react-router'

const NO_STORE = { 'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate' }

/**
 * The learner session, verification-only (spec: Legacy Session Endpoints).
 * The body is unchanged — the session payload or `null` — but this handler
 * never refreshes or writes a cookie. Whether an expired session could be
 * renewed is reported in `x-modulus-session-renewable`; renewal itself is the
 * explicit, coordinated server function.
 */
export const Route = createFileRoute('/routes/auth/session')({
  server: {
    handlers: {
      GET: async () => {
        const { getUserSessionState } = await import('@/lib/session/context')
        const state = await getUserSessionState()
        return Response.json(state.status === 'valid' ? state.session : null, {
          headers: {
            ...NO_STORE,
            'x-modulus-session-renewable': state.status === 'renewable' ? 'true' : 'false',
          },
        })
      },
    },
  },
})

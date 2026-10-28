import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/oauth/google')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (
          await import(
            '@modulus-learning/host-tanstack-start/modules/app/session/oauth-callback.server'
          )
        ).handleGoogleCallback(request),
    },
  },
})

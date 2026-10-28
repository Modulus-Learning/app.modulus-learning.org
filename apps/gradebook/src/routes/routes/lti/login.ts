import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/lti/login')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        (
          await import('@modulus-learning/host-tanstack-start/modules/lti/handlers/login.server')
        ).handleLtiLogin(request),
    },
  },
})

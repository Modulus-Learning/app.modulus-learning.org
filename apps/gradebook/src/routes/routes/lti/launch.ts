import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/lti/launch')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        (
          await import('@modulus-learning/host-tanstack-start/modules/lti/handlers/launch.server')
        ).handleLtiLaunch(request),
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/agent/token')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        (
          await import('@modulus-learning/host-tanstack-start/modules/agent/handlers/token.server')
        ).handleAgentToken(request),
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/agent/token')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        (await import('@/modules/agent/handlers/token.server')).handleAgentToken(request),
    },
  },
})

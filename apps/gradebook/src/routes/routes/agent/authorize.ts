import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/agent/authorize')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import('@/modules/agent/handlers/authorize.server')).handleAgentAuthorize(request),
    },
  },
})

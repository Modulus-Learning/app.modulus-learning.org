import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/lti/login')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        (await import('@/modules/lti/handlers/login.server')).handleLtiLogin(request),
    },
  },
})

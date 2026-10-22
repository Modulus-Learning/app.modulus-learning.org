import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/oauth/google')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import('@/modules/app/session/oauth-callback.server')).handleGoogleCallback(request),
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/oauth/github')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import('@/modules/app/session/oauth-callback.server')).handleGithubCallback(request),
    },
  },
})

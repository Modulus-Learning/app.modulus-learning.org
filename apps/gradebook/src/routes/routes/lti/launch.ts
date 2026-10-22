import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/lti/launch')({
  server: {
    handlers: {
      POST: async ({ request }) =>
        (await import('@/modules/lti/handlers/launch.server')).handleLtiLaunch(request),
    },
  },
})

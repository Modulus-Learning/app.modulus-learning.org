import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/routes/agent/activity')({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { AGENT_ACTIVITY_CORS } = await import(
          '@modulus-learning/host-tanstack-start/modules/agent/handlers/activity.server'
        )
        return new Response(null, { status: 200, headers: AGENT_ACTIVITY_CORS })
      },
      POST: async ({ request }) =>
        (
          await import(
            '@modulus-learning/host-tanstack-start/modules/agent/handlers/activity.server'
          )
        ).handleAgentActivity(request),
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'

// Load-balancer health probe. Neutral: served in every deployment mode.
export const Route = createFileRoute('/routes/elb-status')({
  server: {
    handlers: {
      GET: () => Response.json({ status: 'okay' }),
    },
  },
})

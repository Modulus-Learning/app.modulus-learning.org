import { createFileRoute } from '@tanstack/react-router'

// The packaged eager-boot plugin requests this route at startup.
export const Route = createFileRoute('/routes/elb-status')({
  server: {
    handlers: {
      GET: async () => Response.json({ status: 'okay' }),
    },
  },
})

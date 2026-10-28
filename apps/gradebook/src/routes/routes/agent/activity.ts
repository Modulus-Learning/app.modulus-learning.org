import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/agent/activity'

export const Route = createFileRoute('/routes/agent/activity')({
  server: { handlers },
})

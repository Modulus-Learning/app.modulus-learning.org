import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/agent/token'

export const Route = createFileRoute('/routes/agent/token')({
  server: { handlers },
})

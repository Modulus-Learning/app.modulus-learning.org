import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/agent/authorize'

export const Route = createFileRoute('/routes/agent/authorize')({
  server: { handlers },
})

import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/keep-alive'

export const Route = createFileRoute('/routes/keep-alive')({
  server: { handlers },
})

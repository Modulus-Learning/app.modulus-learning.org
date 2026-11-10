import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/auth/session'

export const Route = createFileRoute('/routes/auth/session')({
  server: { handlers },
})

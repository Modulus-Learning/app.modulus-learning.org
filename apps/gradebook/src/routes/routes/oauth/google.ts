import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/oauth/google'

export const Route = createFileRoute('/routes/oauth/google')({
  server: { handlers },
})

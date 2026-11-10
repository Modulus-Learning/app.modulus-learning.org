import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/oauth/github'

export const Route = createFileRoute('/routes/oauth/github')({
  server: { handlers },
})

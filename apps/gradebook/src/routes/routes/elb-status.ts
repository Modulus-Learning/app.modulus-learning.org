import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/elb-status'

export const Route = createFileRoute('/routes/elb-status')({
  server: { handlers },
})

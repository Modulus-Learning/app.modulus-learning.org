import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/lti/login'

export const Route = createFileRoute('/routes/lti/login')({
  server: { handlers },
})

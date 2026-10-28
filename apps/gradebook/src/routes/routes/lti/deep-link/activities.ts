import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/lti/deep-link/activities'

export const Route = createFileRoute('/routes/lti/deep-link/activities')({
  server: { handlers },
})

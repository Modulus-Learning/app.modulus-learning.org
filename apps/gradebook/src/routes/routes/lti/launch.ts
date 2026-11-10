import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/lti/launch'

export const Route = createFileRoute('/routes/lti/launch')({
  server: { handlers },
})

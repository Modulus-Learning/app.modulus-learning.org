import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/lti/jwks'

export const Route = createFileRoute('/routes/lti/jwks')({
  server: { handlers },
})

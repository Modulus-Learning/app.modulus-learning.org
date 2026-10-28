import { createFileRoute } from '@tanstack/react-router'

import { handlers } from '@modulus-learning/host-tanstack-start/server-routes/elb-status'

// A literal createFileRoute with packaged handlers, so Start strips the
// handlers from the client build. The eager-boot plugin requests this route.
export const Route = createFileRoute('/routes/elb-status')({
  server: { handlers },
})

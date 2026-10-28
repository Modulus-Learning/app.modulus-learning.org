import { createFileRoute } from '@tanstack/react-router'

import { spikeStatusHandlers } from '@modulus-learning/host-tanstack-start/spike/server-routes'

export const Route = createFileRoute('/routes/spike-status')({
  server: { handlers: spikeStatusHandlers },
})

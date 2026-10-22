import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { findPublicEnvDrift } from '@/lib/env-drift'

// TanStack Start server entry: the lowest app-owned request chokepoint, run on
// the original, un-rewritten request before the router. Task 5 adds the
// request scope, access logging, deployment-mode gate and redirects here.

const drift = findPublicEnvDrift()
if (drift.length > 0) {
  console.warn(
    `Runtime values differ from the client build for ${drift.join(', ')}; the browser keeps the build-time values. Rebuild to change them.`
  )
}

export default createServerEntry({
  fetch: (request) => handler.fetch(request),
})

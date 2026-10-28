import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { createModulusFetch } from '@modulus-learning/host-tanstack-start/server/entry'

// The lowest app-owned request chokepoint. `createModulusFetch` validates the
// server configuration, starts background jobs where the deployment mode
// allows, installs graceful shutdown, and gates every request by mode.
export default createServerEntry({
  fetch: createModulusFetch((request) => handler.fetch(request)),
})

import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { getServerConfig } from '@/config'
import { negotiateLocaleRedirect } from '@/i18n/server-locale-redirect'
import { createEntryHandler } from '@/lib/entry'
import { findPublicEnvDrift } from '@/lib/env-drift'
import { getServerLogger } from '@/lib/server-logger'

// TanStack Start server entry: the lowest app-owned request chokepoint, run on
// the original, un-rewritten request before the router. Everything below runs
// once per process; the per-request pipeline lives in `@/lib/entry`.

// Validate the whole server configuration at boot, so a misconfigured instance
// fails to start rather than failing on its first request.
const config = getServerConfig()
const logger = getServerLogger()

const drift = findPublicEnvDrift()
if (drift.length > 0) {
  logger.warn(
    { keys: drift },
    'runtime values differ from the client build; the browser keeps the build-time values until a rebuild'
  )
}

export default createServerEntry({
  fetch: createEntryHandler(
    { mode: config.deployment.mode, logger, negotiateLocale: negotiateLocaleRedirect },
    async (request) => handler.fetch(request)
  ),
})

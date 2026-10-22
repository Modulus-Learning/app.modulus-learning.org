import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { getServerConfig } from '@/config'
import { negotiateLocaleRedirect } from '@/i18n/server-locale-redirect'
import { getCoreInstance } from '@/lib/core/instance'
import { backgroundJobsEnabled, servedSurfaces } from '@/lib/deployment-mode'
import { createEntryHandler } from '@/lib/entry'
import { findPublicEnvDrift } from '@/lib/env-drift'
import { getServerLogger } from '@/lib/server-logger'
import {
  createInFlightTracker,
  createShutdown,
  drainDeadlineWarning,
  installShutdownSignals,
  startBackgroundJobsOnce,
} from '@/lib/shutdown'

// TanStack Start server entry: the lowest app-owned request chokepoint, run on
// the original, un-rewritten request before the router. Everything below runs
// once per process; the per-request pipeline lives in `@/lib/entry`.

// Validate the whole server configuration at boot, so a misconfigured instance
// fails to start rather than failing on its first request.
const config = getServerConfig()
const logger = getServerLogger()
const mode = config.deployment.mode
const jobs = backgroundJobsEnabled(config)

logger.info({ mode, jobs, surfaces: servedSurfaces(mode) }, 'gradebook starting')

const drift = findPublicEnvDrift()
if (drift.length > 0) {
  logger.warn(
    { keys: drift },
    'runtime values differ from the client build; the browser keeps the build-time values until a rebuild'
  )
}

const inFlight = createInFlightTracker()

// Background jobs run only on `admin` and `all-in-one` instances (config
// validation also forbids them on `frontend`). Such an instance owns process
// exit on SIGTERM/SIGINT, so a rolling deploy lets an in-flight score
// submission finish (spec: Deployment Modes item 5). Without jobs, Nitro's own
// graceful close is enough.
if (jobs) {
  const { shutdownDrainSeconds, scoreSubmissionRequestTimeoutSeconds } = config.jobQueue
  const warning = drainDeadlineWarning(shutdownDrainSeconds, scoreSubmissionRequestTimeoutSeconds)
  if (warning != null) logger.warn({ shutdownDrainSeconds }, warning)

  // Not awaited: HTTP comes up while core initialises. A failed start is
  // logged, and shutdown then has no workers to drain.
  const started = startBackgroundJobsOnce(async () => {
    logger.info('starting background jobs')
    return (await getCoreInstance(logger)).startBackgroundJobs()
  })
  started.catch((error) => logger.error({ err: error }, 'background jobs failed to start'))
  installShutdownSignals(
    createShutdown({
      stopJobs: async () => {
        const stop = await started.catch(() => null)
        await stop?.()
      },
      inFlight,
      deadlineMs: shutdownDrainSeconds * 1000,
      logger,
      exit: (code) => process.exit(code),
    })
  )
}

export default createServerEntry({
  fetch: createEntryHandler(
    { mode, logger, negotiateLocale: negotiateLocaleRedirect, inFlight },
    async (request) => handler.fetch(request)
  ),
})

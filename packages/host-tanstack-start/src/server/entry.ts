import { getServerConfig } from '@/config/index'
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

/**
 * Boot a Modulus host process and return its server-entry `fetch`. The host's
 * `src/server.ts` keeps the literal `createServerEntry` call Start requires:
 *
 *   export default createServerEntry({
 *     fetch: createModulusFetch((request) => handler.fetch(request)),
 *   })
 *
 * Call it once, at module evaluation: it validates the whole server
 * configuration (so a misconfigured instance fails to start rather than on its
 * first request), starts background jobs on `admin` and `all-in-one`
 * instances, and installs graceful shutdown. The returned handler is the
 * lowest request chokepoint, run on the un-rewritten request before the
 * router: deployment-mode gating, locale negotiation and access logging.
 */
export const createModulusFetch = (render: (request: Request) => Response | Promise<Response>) => {
  const config = getServerConfig()
  const logger = getServerLogger()
  const mode = config.deployment.mode
  const jobs = backgroundJobsEnabled(config)

  logger.info({ mode, jobs, surfaces: servedSurfaces(mode) }, 'modulus starting')

  const drift = findPublicEnvDrift()
  if (drift.length > 0) {
    logger.warn(
      { keys: drift },
      'runtime values differ from the client build; the browser keeps the build-time values until a rebuild'
    )
  }

  const inFlight = createInFlightTracker()

  // Every mode initialises core at boot, so the schema check and the rest of
  // core's validation run before the instance serves anything. Core is a
  // dependency of every surface, not only of the background jobs. A failed
  // initialisation is fatal in production: the process exits and the
  // supervisor restarts it, rather than leaving an instance that looks
  // healthy. Elsewhere it stays up for diagnosis, and `/routes/elb-status`
  // reports 503.
  const core = getCoreInstance(logger)
  core.catch((error) => {
    logger.fatal({ err: error }, 'core failed to initialise')
    if (process.env.NODE_ENV === 'production') process.exit(1)
  })

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
    // logged (and, if core itself failed, handled above), and shutdown then
    // has no workers to drain.
    const started = startBackgroundJobsOnce(async () => {
      const instance = await core
      logger.info('starting background jobs')
      return instance.startBackgroundJobs()
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

  return createEntryHandler(
    { mode, logger, negotiateLocale: negotiateLocaleRedirect, inFlight },
    async (request) => render(request)
  )
}

import type { StopHandle } from '@/index.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AgentAuthMutations } from '@/modules/agent/auth/repository/index.js'
import type { AccountMutations } from '@/modules/app/account/repository/index.js'
import type { LtiMutations } from '@/modules/app/lti/repository/index.js'
import type { RegistrationMutations } from '@/modules/app/registration/repository/index.js'

const HOUR_MS = 60 * 60 * 1000
// An LTI nonce should be claimed within seconds; prune unclaimed after 1 hour
const NONCE_MAX_AGE_MS = 1 * HOUR_MS
// Prune unfinished account registrations after 1 hour.
const REGISTRATION_MAX_AGE_MS = 1 * HOUR_MS
// Prune unclaimed email change requests after 24 hours.
const EMAIL_CHANGE_MAX_AGE_MS = 24 * HOUR_MS

export type HousekeepingMutations = {
  agentAuth: AgentAuthMutations
  lti: LtiMutations
  registration: RegistrationMutations
  account: AccountMutations
}

export type HousekeepingWorkerDeps = {
  logger: CoreLogger
  intervalMs: number
  mutations: HousekeepingMutations
}

/**
 * Periodically prunes short-lived tables: expired agent auth codes, stale LTI
 * nonces, expired pending deep-links, and stale registrations / email-change
 * requests. Lightweight -- a single interval loop with a re-entrancy guard.
 */
export function startHousekeepingWorker(deps: HousekeepingWorkerDeps): StopHandle {
  const { logger, intervalMs, mutations } = deps

  let running = false
  let timer: ReturnType<typeof setInterval> | undefined

  const runPass = async (): Promise<void> => {
    // Never overlap passes (a prune shouldn't run that long, but be safe).
    if (running) return
    running = true
    try {
      const now = Date.now()
      const tasks: Array<readonly [string, Promise<number>]> = [
        ['agent_auth_codes', mutations.agentAuth.pruneExpiredAuthCodes()],
        ['lti_nonces', mutations.lti.pruneExpiredNonces(new Date(now - NONCE_MAX_AGE_MS))],
        ['pending_deep_links', mutations.lti.pruneExpiredDeepLinks()],
        [
          'registrations',
          mutations.registration.pruneRegistrations(new Date(now - REGISTRATION_MAX_AGE_MS)),
        ],
        [
          'email_change_requests',
          mutations.account.pruneEmailChangeRequests(new Date(now - EMAIL_CHANGE_MAX_AGE_MS)),
        ],
      ]

      const settled = await Promise.all(
        tasks.map(async ([table, promise]) => {
          try {
            return { table, count: await promise } as const
          } catch (err) {
            logger.error({ table, err }, 'housekeeping: prune failed')
            return { table, count: null } as const
          }
        })
      )

      const pruned: Record<string, number> = {}
      for (const { table, count } of settled) {
        if (count != null) pruned[table] = count
      }

      logger.info({ pruned }, 'housekeeping: pass complete')
    } finally {
      running = false
    }
  }

  // Run once on startup, then on the interval.
  void runPass()
  timer = setInterval(() => void runPass(), intervalMs)

  return async () => {
    if (timer != null) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

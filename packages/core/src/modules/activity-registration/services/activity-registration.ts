import { BaseService, method } from '@/lib/base-service.js'
import { ERR_UNHANDLED } from '@/lib/errors.js'
import type { CoreLogger } from '@/lib/logger.js'
import type {
  ActivityRecord,
  ActivityUrlAllowlistMutations,
  ActivityUrlAllowlistQueries,
} from '../repository/index.js'
import type { PolicySnapshot, RegistrationDenialReason } from '../schemas.js'
import type { AllowlistPolicyService } from './allowlist-policy.js'

/** The `activities.url` column width. A longer URL simply cannot be stored. */
const MAX_ACTIVITY_URL_LENGTH = 255

export type RegistrationOutcome =
  | { ok: true; activity: ActivityRecord }
  | { ok: false; url: string; reason: RegistrationDenialReason }

/**
 * The single admission seam: the only code path that inserts an `activities`
 * row outside seeds and test fixtures.
 *
 * Routing every admitting path through one service is what makes "no bypasses"
 * structural rather than something a reviewer has to notice. It is also what
 * fixes the drift between the writers it replaces, three of which used
 * `onConflictDoNothing` and one of which did not, and one of which bounded the
 * URL at 255 characters while another let the database raise.
 *
 * **It returns denials; it does not throw them.** The four callers need
 * different outcomes from the same decision — a form error, a deep-link error,
 * an OAuth bounce, a silently rejected cumulative target — and a service that
 * threw would force the progress path into catch-and-continue, which is the
 * exact shape that made its existing failures wrong.
 */
export class ActivityRegistrationService extends BaseService {
  private queries: ActivityUrlAllowlistQueries
  private mutations: ActivityUrlAllowlistMutations
  private policy: AllowlistPolicyService

  constructor(deps: {
    logger: CoreLogger
    queries: ActivityUrlAllowlistQueries
    mutations: ActivityUrlAllowlistMutations
    policy: AllowlistPolicyService
  }) {
    super(deps.logger, 'core', 'activity-registration')
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.policy = deps.policy
  }

  /**
   * Reads the policy once, for the caller to hold across every URL in one
   * admission operation. A five-URL activity-code submission takes one
   * snapshot, so all five are decided coherently.
   */
  @method
  async loadPolicy(): Promise<PolicySnapshot> {
    return await this.policy.loadPolicy()
  }

  /**
   * Resolves a URL to its activity, admitting it first if Modulus has not seen
   * it before.
   *
   * The order of the first two steps is the whole of grandfathering: an
   * activity that already exists is returned without the policy being consulted
   * at all, so editing, disabling or deleting a rule can never withdraw access
   * to content Modulus has already accepted.
   */
  @method
  async register(url: string, policy: PolicySnapshot): Promise<RegistrationOutcome> {
    // 1. A known activity is admitted already. No policy evaluation happens
    //    here, and that absence is the grandfathering contract.
    const existing = await this.queries.findActivityByUrl(url)
    if (existing !== undefined) {
      return { ok: true, activity: existing }
    }

    // 2. The column bound, checked before the policy so an unstorable URL is
    //    reported as such rather than surfacing later as a database error.
    if (url.length > MAX_ACTIVITY_URL_LENGTH) {
      return { ok: false, url, reason: 'url_too_long' }
    }

    // 3. Only a genuinely unseen URL is measured against the policy.
    const evaluation = this.policy.evaluate(url, policy)
    if (!evaluation.ok) {
      // The denial diagnostic carries the normalized origin and path and
      // nothing else. No learner identity, LMS context, token, auth code or
      // PKCE value may ever appear in this line -- it is the one place a
      // denial is recorded, and a denial is not a reason to log a learner.
      const candidate = evaluation.reason === 'malformed_url' ? null : new URL(url)
      this.logger.warn(
        {
          reason: evaluation.reason,
          origin: candidate?.origin,
          path: candidate?.pathname,
        },
        'activity url registration denied'
      )

      return { ok: false, url, reason: evaluation.reason }
    }

    // 4. Admitted, so insert it.
    const inserted = await this.mutations.insertActivity(url)
    if (inserted !== undefined) {
      return { ok: true, activity: inserted }
    }

    // 5. The insert conflicted, so a concurrent registration of the same URL
    //    won. Both callers should succeed and resolve to the one winning row.
    const winner = await this.queries.findActivityByUrl(url)
    if (winner !== undefined) {
      return { ok: true, activity: winner }
    }

    // Neither inserted nor found: the row was created and removed between two
    // statements. Genuinely unhandled, and raised rather than returned because
    // it is not a decision any caller can act on.
    throw ERR_UNHANDLED({
      message: 'activity registration neither inserted nor resolved a row',
      details: { url },
    }).log(this.logger)
  }
}

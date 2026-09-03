import { BaseService, method } from '@/lib/base-service.js'
import { matchesRule, parseAdmissibleUrl } from '../url-policy.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityUrlAllowlistQueries } from '../repository/index.js'
import type { PolicyEvaluation, PolicySnapshot } from '../schemas.js'

/**
 * Puts the stored rules and the pure matcher together behind one
 * snapshot-plus-evaluate interface.
 *
 * The split is deliberate: `loadPolicy()` is the only method that touches the
 * database, and `evaluate()` is pure with respect to the snapshot it is handed.
 * That makes "every URL in one admission operation is decided against a single
 * policy snapshot" a property of the signature rather than a convention a
 * caller can forget.
 */
export class AllowlistPolicyService extends BaseService {
  private queries: ActivityUrlAllowlistQueries

  constructor(deps: {
    logger: CoreLogger
    queries: ActivityUrlAllowlistQueries
  }) {
    super(deps.logger, 'core', 'activity-registration')
    this.queries = deps.queries
  }

  /**
   * Reads the enabled rules and normalizes each into the matcher's shape.
   *
   * There is deliberately **no process-local cache**. Registration is rare
   * relative to progress traffic, and an already-known activity never reaches
   * here at all, so the read costs little; caching would need a cross-instance
   * invalidation scheme this feature does not have, and without one an
   * administrator's edit would take effect on one instance and not another.
   */
  @method
  async loadPolicy(): Promise<PolicySnapshot> {
    const rules = await this.queries.listEnabledRules()

    return {
      rules: rules.map(({ origin, path_prefix }) => ({ origin, path_prefix })),
    }
  }

  /**
   * Decides one candidate URL against a snapshot. Performs no I/O: the caller
   * has already paid for the snapshot and may reuse it for every URL in the
   * operation.
   *
   * An empty `policy.rules` denies everything, and does so as the ordinary
   * consequence of no rule having matched — there is no branch here that treats
   * the empty set as permissive, which is what makes the policy
   * deny-by-default rather than deny-by-default-until-someone-adds-a-shortcut.
   */
  @method
  evaluate(url: string, policy: PolicySnapshot): PolicyEvaluation {
    const candidate = parseAdmissibleUrl(url)
    if (candidate === null) {
      return { ok: false, reason: 'malformed_url' }
    }

    if (!policy.rules.some((rule) => matchesRule(candidate, rule))) {
      return { ok: false, reason: 'activity_url_not_allowed' }
    }

    return { ok: true, url: candidate }
  }
}

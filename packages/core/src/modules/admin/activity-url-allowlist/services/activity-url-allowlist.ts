import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_NOT_FOUND, ERR_VALIDATION } from '@/lib/errors.js'
import {
  matchesRule,
  normalizeRuleBaseUrl,
  parseAdmissibleUrl,
  toBaseUrl,
} from '@/modules/activity-registration/url-policy.js'
import {
  type AllowlistRuleListResponse,
  type AllowlistRuleResponse,
  type CreateAllowlistRuleRequest,
  type CreateAllowlistRuleResponse,
  type DeleteAllowlistRuleRequest,
  MAX_RULE_BASE_URL_LENGTH,
  type PreviewAllowlistImpactRequest,
  type PreviewAllowlistImpactResponse,
  toAllowlistRule,
  type UpdateAllowlistRuleRequest,
} from '../schemas.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type {
  ActivityUrlAllowlistMutations,
  ActivityUrlAllowlistQueries,
} from '@/modules/activity-registration/repository/index.js'
import type { AllowlistPolicyService } from '@/modules/activity-registration/services/allowlist-policy.js'
import type { NormalizedBaseUrl } from '@/modules/activity-registration/url-policy.js'

/** How many offending URLs the grandfathering preview returns alongside its count. */
const PREVIEW_SAMPLE_SIZE = 20

/**
 * The administrator's view of site trust policy.
 *
 * These commands change **policy only**. They must never touch `activities` or
 * `activity_activity_code`: a rule change admits or stops admitting *new* URLs,
 * and can never delete an activity, drop an association, or withdraw access to
 * content Modulus has already accepted. That is the grandfathering contract,
 * and the absence of those dependencies here is what enforces it.
 */
export class AdminActivityUrlAllowlistService extends BaseService {
  private queries: ActivityUrlAllowlistQueries
  private mutations: ActivityUrlAllowlistMutations
  private policy: AllowlistPolicyService

  constructor(deps: {
    logger: CoreLogger
    queries: ActivityUrlAllowlistQueries
    mutations: ActivityUrlAllowlistMutations
    policy: AllowlistPolicyService
  }) {
    super(deps.logger, 'admin', 'activity-url-allowlist')
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.policy = deps.policy
  }

  /**
   * Normalizes one administrator-supplied base URL, or raises `ERR_VALIDATION`.
   *
   * The length bound is on the **derived base URL**, not on either column.
   * `activities.url` is `varchar(255)`, so a rule whose base URL is longer than
   * that could never match a storable activity URL: it would be accepted,
   * listed, and permanently inert. Neither column width can express this, since
   * `origin` and `path_prefix` can each be within their own bound while the
   * pair is not.
   */
  private normalizeOrRaise(input: string): NormalizedBaseUrl {
    const normalized = normalizeRuleBaseUrl(input)
    if (!normalized.ok) {
      throw ERR_VALIDATION({
        message:
          'Base URL must be an absolute HTTPS URL, or an HTTP localhost/127.0.0.1 URL for local development.',
        details: { base_url: input },
      }).log(this.logger)
    }

    if (toBaseUrl(normalized.rule).length > MAX_RULE_BASE_URL_LENGTH) {
      throw ERR_VALIDATION({
        message: `Base URL must be ${MAX_RULE_BASE_URL_LENGTH} characters or fewer. A longer rule could never match a storable activity URL.`,
        details: { base_url: input },
      }).log(this.logger)
    }

    return normalized.rule
  }

  @method
  async listAllowlistRules(_auth: AdminAuth): Promise<AllowlistRuleListResponse> {
    const rules = await this.queries.listRules()

    return { rules: rules.map(toAllowlistRule) }
  }

  /**
   * Counts the existing activities a prospective policy would not have
   * admitted — the ones that are, and stay, grandfathered.
   *
   * Matching happens here with the same pure matcher every admission uses, not
   * in SQL. A SQL reimplementation would be a second definition of the matching
   * contract, free to drift from the first exactly as the host's own URL
   * validator already has.
   *
   * With no `base_urls`, it previews the policy currently in force, which is
   * how the rules screen reports what the present configuration leaves
   * grandfathered.
   */
  @method
  async previewAllowlistImpact(
    _auth: AdminAuth,
    request: PreviewAllowlistImpactRequest
  ): Promise<PreviewAllowlistImpactResponse> {
    const prospective =
      request.base_urls === undefined
        ? (await this.policy.loadPolicy()).rules
        : request.base_urls.map((base_url) => this.normalizeOrRaise(base_url))

    const activities = await this.queries.listActivities()

    const outside = activities.filter(({ url }) => {
      const candidate = parseAdmissibleUrl(url)
      // A stored URL the admission syntax no longer accepts is outside any
      // prospective policy by definition, and stays grandfathered.
      if (candidate === null) {
        return true
      }
      return !prospective.some((rule) => matchesRule(candidate, rule))
    })

    return {
      total_activities: activities.length,
      grandfathered_count: outside.length,
      grandfathered_sample: outside.slice(0, PREVIEW_SAMPLE_SIZE),
    }
  }

  /**
   * Creates a rule for one base URL, reporting what it found rather than
   * inserting blind.
   *
   * Because normalization collapses `https://x/a` and `https://x/a/` onto the
   * same pair, a collision is an ordinary outcome of an ordinary submission,
   * not an exception.
   */
  @method
  async createAllowlistRule(
    auth: AdminAuth,
    request: CreateAllowlistRuleRequest
  ): Promise<CreateAllowlistRuleResponse> {
    const rule = this.normalizeOrRaise(request.base_url)

    const existing = await this.queries.findRuleByBase(rule.origin, rule.path_prefix)
    if (existing !== undefined) {
      // Nothing is written in either branch. Re-enabling is the administrator's
      // explicit next action through `updateAllowlistRule`, not a silent side
      // effect of a create they may not have realized was a collision.
      return {
        status: existing.is_enabled ? 'already_enabled' : 'disabled_match',
        rule: toAllowlistRule(existing),
      }
    }

    const created = await this.mutations.createRule({
      id: uuidv7(),
      origin: rule.origin,
      path_prefix: rule.path_prefix,
      description: request.description ?? null,
      is_enabled: true,
      created_by: auth.admin_id,
      updated_by: auth.admin_id,
    })

    return { status: 'created', rule: toAllowlistRule(created) }
  }

  /**
   * Changes a rule's description and enabled state.
   *
   * `origin` and `path_prefix` are never rewritten: changing the base URL makes
   * it a different rule, so that is a delete plus a create.
   */
  @method
  async updateAllowlistRule(
    auth: AdminAuth,
    request: UpdateAllowlistRuleRequest
  ): Promise<AllowlistRuleResponse> {
    const existing = await this.queries.findRuleById(request.id)
    if (existing === undefined) {
      throw ERR_NOT_FOUND({ message: 'Allowlist rule not found' }).log(this.logger)
    }

    const updated = await this.mutations.updateRule(request.id, {
      // An omitted field is left alone, so re-enabling a rule preserves the
      // description and provenance it was created with.
      ...(request.description !== undefined ? { description: request.description ?? null } : {}),
      ...(request.is_enabled !== undefined ? { is_enabled: request.is_enabled } : {}),
      updated_by: auth.admin_id,
    })

    if (updated === undefined) {
      throw ERR_NOT_FOUND({ message: 'Allowlist rule not found' }).log(this.logger)
    }

    return { rule: toAllowlistRule(updated) }
  }

  @method
  async deleteAllowlistRule(
    _auth: AdminAuth,
    request: DeleteAllowlistRuleRequest
  ): Promise<DeleteAllowlistRuleRequest> {
    const existing = await this.queries.findRuleById(request.id)
    if (existing === undefined) {
      throw ERR_NOT_FOUND({ message: 'Allowlist rule not found' }).log(this.logger)
    }

    // Deleting a rule withdraws it from future admissions and does nothing
    // else. Every activity it ever admitted stays exactly as it is.
    await this.mutations.deleteRule(request.id)

    return { id: request.id }
  }
}

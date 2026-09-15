import * as crypto from 'node:crypto'

import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator'
import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { normalizeActivityUrl } from '@/modules/activity-registration/activity-url.js'
import { activityUrlNotAllowed } from '@/modules/activity-registration/errors.js'
import {
  ERR_ACTIVITY_CODE_GENERATION,
  ERR_ACTIVITY_CODE_NOT_FOUND,
  ERR_USER_NOT_INSTRUCTOR,
} from '../errors.js'
import {
  type ActivityCode,
  type ActivityCodeMember,
  type ActivityCodeWithActivities,
  type AddActivityCodeMemberRequest,
  type CreateActivityCodeRequest,
  type InstructorSearchResult,
  type ProgressReport,
  type ProgressRequest,
  type RemoveActivityCodeMemberRequest,
  type SearchInstructorsRequest,
  toActivity,
  toActivityCode,
  type UpdateActivityCodeRequest,
} from '../schemas.js'
import type { UserAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityRecord as RegisteredActivity } from '@/modules/activity-registration/repository/index.js'
import type { RejectedRegistration } from '@/modules/activity-registration/schemas.js'
import type { ActivityRegistrationService } from '@/modules/activity-registration/services/activity-registration.js'
import type { ActivityMutations, ActivityQueries } from '../repository/index.js'

export class ActivityService extends BaseService {
  private tx: TXManager
  private queries: ActivityQueries
  private mutations: ActivityMutations
  private registration: ActivityRegistrationService

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    queries: ActivityQueries
    mutations: ActivityMutations
    activityRegistration: { service: ActivityRegistrationService }
  }) {
    super(deps.logger, 'app', 'activities')
    this.tx = deps.tx
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.registration = deps.activityRegistration.service
  }

  /**
   * Resolves every submitted URL to an activity, admitting the ones Modulus has
   * not seen before, and refuses the whole submission if any is denied.
   *
   * Two properties matter here and neither is incidental:
   *
   *   - **Resolve before evaluate.** A URL that already has an activity is
   *     returned without the policy being consulted, so an instructor whose
   *     code contains a grandfathered URL can still save a description edit.
   *     Requiring the whole submitted set to match current rules would make
   *     that fail until they deleted their own content from their own code.
   *   - **All or nothing.** A denial names *every* offending URL and writes
   *     none of them. A code saved with only the approved subset would differ
   *     silently from the instructor's form.
   *
   * Submitted URLs are grouped by canonical activity URL, so equivalent
   * spellings on two lines register once and associate one activity. A denial
   * is expanded back to every distinct submitted spelling of the denied key,
   * so the host can mark each line the instructor typed. Denials therefore
   * follow canonical order, with unparseable URLs first in submission order --
   * not the raw order of the form.
   */
  private async registerActivityUrls(urls: string[]): Promise<RegisteredActivity[]> {
    // One snapshot for the whole submission. Five unseen URLs evaluated under
    // two different policies would produce a partial admission, or a rejection
    // naming an arbitrary subset, that the instructor cannot act on.
    const policy = await this.registration.loadPolicy()

    const rejected: RejectedRegistration[] = []

    // Canonical key -> the distinct submitted spellings that resolve to it.
    // The public commands reject unparseable URLs before this handler runs;
    // a direct caller's malformed URL is still denied here, and never enters
    // the map under a `null` key where distinct malformed inputs would merge.
    const spellingsByKey = new Map<string, string[]>()
    for (const url of urls) {
      const key = normalizeActivityUrl(url)
      if (key === null) {
        if (!rejected.some((entry) => entry.url === url)) {
          rejected.push({ url, reason: 'malformed_url' })
        }
        continue
      }

      const spellings = spellingsByKey.get(key)
      if (spellings === undefined) {
        spellingsByKey.set(key, [url])
      } else if (!spellings.includes(url)) {
        spellings.push(url)
      }
    }

    // Canonical keys, sorted and de-duplicated, so that every transaction
    // acquires row locks in the same order. Each registration is its own
    // statement rather than one multi-row insert, so two instructors
    // submitting codes that share unseen URLs in different orders -- or in
    // different spellings -- could otherwise deadlock on each other's
    // uncommitted rows and have one aborted by Postgres.
    const ordered = [...spellingsByKey.keys()].sort()

    // Keyed by activity ID so each resolved activity is associated once.
    const activities = new Map<string, RegisteredActivity>()

    for (const key of ordered) {
      const outcome = await this.registration.register(key, policy)
      if (outcome.ok) {
        activities.set(outcome.activity.id, outcome.activity)
      } else {
        for (const url of spellingsByKey.get(key) ?? []) {
          rejected.push({ url, reason: outcome.reason })
        }
      }
    }

    if (rejected.length > 0) {
      // Never `.log()` this error: `details.rejected` carries the full URLs,
      // query strings and fragments included, and `CoreError.log()` spreads
      // `details` straight into the record. `register()` has already recorded
      // each denial with its origin and path alone, so all that is left to say
      // here is how many there were -- and `url_too_long`, which `register()`
      // returns before its own warn, would otherwise go unrecorded.
      this.logger.warn(
        { rejected_count: rejected.length, reasons: rejected.map(({ reason }) => reason) },
        'activity url registration denied for a submitted set'
      )

      // Raised inside the caller's transaction, which rolls back: neither the
      // code, its first member, the unseen activities, nor any association
      // survives a denial.
      throw activityUrlNotAllowed(rejected)
    }

    return [...activities.values()]
  }

  @method
  async listActivityCodes(userAuth: UserAuth): Promise<ActivityCode[]> {
    const records = await this.queries.listActivityCodesByMember(userAuth.id)
    return records.map(toActivityCode)
  }

  /**
   * Loads an activity code only if the caller is a member of it. Treated as
   * a 404 (ERR_ACTIVITY_CODE_NOT_FOUND) when the caller is not a member, so
   * we don't leak the existence of codes that belong to other instructors.
   */
  private async loadAsMember(
    userAuth: UserAuth,
    id: string
  ): Promise<{
    record: NonNullable<Awaited<ReturnType<ActivityQueries['findActivityCodeById']>>>
  }> {
    const record = await this.queries.findActivityCodeById(id)
    if (record == null) {
      throw ERR_ACTIVITY_CODE_NOT_FOUND({
        message: 'activity code not found',
      }).log(this.logger)
    }
    const member = await this.queries.isMember(id, userAuth.id)
    if (!member) {
      throw ERR_ACTIVITY_CODE_NOT_FOUND({
        message: 'activity code not found for user',
      }).log(this.logger)
    }
    return { record }
  }

  @method
  async getActivityCode(userAuth: UserAuth, id: string): Promise<ActivityCode> {
    const { record } = await this.loadAsMember(userAuth, id)
    return toActivityCode(record)
  }

  @method
  async getActivitiesByActivityCodeId(
    userAuth: UserAuth,
    id: string
  ): Promise<ActivityCodeWithActivities> {
    const { record: activityCodeRecord } = await this.loadAsMember(userAuth, id)

    const activityRecords = await this.queries.listActivitiesByActivityCodeId(activityCodeRecord.id)

    return {
      activity_code: toActivityCode(activityCodeRecord),
      activities: activityRecords.map(toActivity),
    }
  }

  @method
  async getProgress(userAuth: UserAuth, request: ProgressRequest): Promise<ProgressReport> {
    const { record: activityCodeRecord } = await this.loadAsMember(userAuth, request.id)

    const { page, page_size, query, order, desc } = request.options

    const results = await this.queries.getActivityCodeProgress(
      activityCodeRecord.id,
      request.options
    )

    // Extract total progress items from the first row (if any)
    const total = results[0]?.total ?? 0

    return {
      progress: results.map(
        ({
          user_id,
          full_name,
          activity_code,
          activity_code_id,
          progress,
          activity_name,
          activity_url,
          created_at,
          updated_at,
        }) => ({
          user_id,
          full_name,
          activity_code,
          activity_code_id,
          progress,
          activity_name,
          activity_url,
          created_at: created_at?.toISOString() ?? null,
          updated_at: updated_at?.toISOString() ?? null,
        })
      ),
      included: {
        activity_code: toActivityCode(activityCodeRecord),
      },
      meta: {
        total,
        page,
        page_size,
        total_pages: Math.ceil(total / page_size),
        query,
        order,
        desc,
      },
    }
  }

  /**
   * Generates a random two-word activity code, and checks that it hasn't been
   * used already.
   */
  @method
  async generateUniqueActivityCode(_userAuth: UserAuth): Promise<string> {
    const maxAttempts = 20
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const code = uniqueNamesGenerator({
        dictionaries: [adjectives, animals],
        separator: '-',
        length: 2,
      })

      const preexistingCode = await this.queries.findActivityCodeByPublicCode(code)
      if (preexistingCode == null) {
        return code
      }
    }

    throw ERR_ACTIVITY_CODE_GENERATION({
      message: `failed to generate a unique code after ${maxAttempts} attempts`,
    }).log(this.logger)
  }

  @method
  async createActivityCode(
    userAuth: UserAuth,
    request: CreateActivityCodeRequest
  ): Promise<ActivityCode> {
    return this.tx.withTransaction(async () => {
      const private_code = crypto.randomBytes(8).toString('hex')

      const activityCodeRecord = await this.mutations.createActivityCode({
        id: uuidv7(),
        code: request.code,
        private_code,
        url_prefix: request.url_prefix ?? null,
        description: request.description ?? null,
        created_by: userAuth.id,
      })

      // Creator is automatically the first member.
      await this.mutations.addMember(activityCodeRecord.id, userAuth.id)

      const activityRecords = await this.registerActivityUrls(request.urls)
      await this.mutations.assignActivitiesToActivityCode(activityCodeRecord, activityRecords)

      return toActivityCode(activityCodeRecord)
    })
  }

  @method
  async updateActivityCode(
    userAuth: UserAuth,
    { id, url_prefix, description, urls }: UpdateActivityCodeRequest
  ): Promise<ActivityCode> {
    // The command schema has already rejected unparseable URLs and any query
    // or fragment, and canonicalized `url_prefix`. Checking activity URLs
    // against that prefix stays in the host by explicit decision; the sitewide
    // allowlist is enforced by `registerActivityUrls` below.

    // 1. Check that the caller is a member of the activity code.
    const { record: activityCodeRecord } = await this.loadAsMember(userAuth, id)

    // 2. We'll clear/delete all existing activityActivityCode joins for this activity code
    // so that we can re-create them with the new URLs.
    // TODO: NOTE! This does not solve the issue of activities (and URLs) that
    // are not longer being used, whether by this activity code, other activity codes,
    // or activity URLs that may have been created by users that attempted activities
    // that are allowed, but not associated with any activity code.
    return this.tx.withTransaction(async () => {
      const updatedActivityCodeRecord = await this.mutations.updateActivityCode(id, {
        url_prefix: url_prefix ?? null,
        description: description ?? null,
      })

      // Resolve every submitted URL, admitting the unseen ones. A known
      // activity needs no check, so removing and re-creating the associations
      // below has no bearing on the policy -- and removals are always allowed.
      const activityRecords = await this.registerActivityUrls(urls)

      await this.mutations.removeActivitiesFromActivityCode(activityCodeRecord)
      await this.mutations.assignActivitiesToActivityCode(activityCodeRecord, activityRecords)

      return toActivityCode(updatedActivityCodeRecord)
    })
  }

  @method
  async deleteActivityCode(userAuth: UserAuth, id: string): Promise<void> {
    await this.loadAsMember(userAuth, id)
    await this.mutations.deleteActivityCode(id)
  }

  @method
  async listActivityCodeMembers(
    userAuth: UserAuth,
    activity_code_id: string
  ): Promise<ActivityCodeMember[]> {
    await this.loadAsMember(userAuth, activity_code_id)
    return await this.queries.listMembers(activity_code_id)
  }

  @method
  async searchInstructors(
    userAuth: UserAuth,
    { activity_code_id, query, limit }: SearchInstructorsRequest
  ): Promise<InstructorSearchResult[]> {
    await this.loadAsMember(userAuth, activity_code_id)
    return await this.queries.searchInstructors(activity_code_id, query, limit)
  }

  @method
  async addActivityCodeMember(
    userAuth: UserAuth,
    { activity_code_id, user_id }: AddActivityCodeMemberRequest
  ): Promise<ActivityCodeMember[]> {
    await this.loadAsMember(userAuth, activity_code_id)
    const isInstructor = await this.queries.isInstructor(user_id)
    if (!isInstructor) {
      throw ERR_USER_NOT_INSTRUCTOR({
        message: 'target user is not an instructor',
      }).log(this.logger)
    }
    await this.mutations.addMember(activity_code_id, user_id)
    return await this.queries.listMembers(activity_code_id)
  }

  @method
  async removeActivityCodeMember(
    userAuth: UserAuth,
    { activity_code_id, user_id }: RemoveActivityCodeMemberRequest
  ): Promise<ActivityCodeMember[]> {
    await this.loadAsMember(userAuth, activity_code_id)
    await this.mutations.removeMember(activity_code_id, user_id)
    return await this.queries.listMembers(activity_code_id)
  }
}

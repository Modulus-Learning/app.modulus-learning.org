import * as crypto from 'node:crypto'

import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator'
import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_ACTIVITY_CODE_GENERATION, ERR_ACTIVITY_CODE_NOT_FOUND } from '../errors.js'
import {
  type ActivityCode,
  type ActivityCodeWithActivities,
  type CreateActivityCodeRequest,
  type ProgressReport,
  type ProgressRequest,
  toActivity,
  toActivityCode,
  type UpdateActivityCodeRequest,
} from '../schemas.js'
import type { UserAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { ActivityMutations, ActivityQueries } from '../repository/index.js'

export class ActivityService extends BaseService {
  private tx: TXManager
  private queries: ActivityQueries
  private mutations: ActivityMutations

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    queries: ActivityQueries
    mutations: ActivityMutations
  }) {
    super(deps.logger, 'app', 'activities')
    this.tx = deps.tx
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async listActivityCodes(userAuth: UserAuth): Promise<ActivityCode[]> {
    const records = await this.queries.listActivityCodesByOwner(userAuth.id)
    return records.map(toActivityCode)
  }

  @method
  async getActivityCode(_userAuth: UserAuth, id: string): Promise<ActivityCode> {
    const record = await this.queries.findActivityCodeById(id)
    if (record == null) {
      throw ERR_ACTIVITY_CODE_NOT_FOUND({
        message: 'activity code not found',
      }).log(this.logger)
    }

    return toActivityCode(record)
  }

  @method
  async getActivitiesByActivityCodeId(
    _userAuth: UserAuth,
    id: string
  ): Promise<ActivityCodeWithActivities> {
    const activityCodeRecord = await this.queries.findActivityCodeById(id)
    if (activityCodeRecord == null) {
      throw ERR_ACTIVITY_CODE_NOT_FOUND({
        message: 'activity code not found',
      }).log(this.logger)
    }

    const activityRecords = await this.queries.listActivitiesByActivityCodeId(activityCodeRecord.id)

    return {
      activity_code: toActivityCode(activityCodeRecord),
      activities: activityRecords.map(toActivity),
    }
  }

  @method
  async getProgress(_userAuth: UserAuth, request: ProgressRequest): Promise<ProgressReport> {
    const activityCodeRecord = await this.queries.findActivityCodeById(request.id)
    if (activityCodeRecord == null) {
      throw ERR_ACTIVITY_CODE_NOT_FOUND({
        message: 'activity code not found',
      }).log(this.logger)
    }

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
        user_id: userAuth.id,
      })

      await this.mutations.ensureActivitiesExist(request.urls)
      const activityRecords = await this.queries.findActivitiesByURL(request.urls)
      await this.mutations.assignActivitiesToActivityCode(activityCodeRecord, activityRecords)

      return toActivityCode(activityCodeRecord)
    })
  }

  @method
  async updateActivityCode(
    userAuth: UserAuth,
    { id, urls }: UpdateActivityCodeRequest
  ): Promise<ActivityCode> {
    // TODO: Validate urls, here and in createActivityCode
    // const urlValidationResult = validateUrls(urls)
    // if (urlValidationResult.valid === false) {
    //   throw new ERR_INVALID_ACTIVITY_URL(urlValidationResult.message)
    // }

    // 1. Check that we have an existing activity code for the user
    const activityCodeRecord = await this.queries.findActivityCodeById(id)
    if (activityCodeRecord?.user_id !== userAuth.id) {
      throw ERR_ACTIVITY_CODE_NOT_FOUND({
        message: 'activity code not found for user',
      }).log(this.logger)
    }

    // 2. We'll clear/delete all existing activityActivityCode joins for this activity code
    // so that we can re-create them with the new URLs.
    // TODO: NOTE! This does not solve the issue of activities (and URLs) that
    // are not longer being used, whether by this activity code, other activity codes,
    // or activity URLs that may have been created by users that attempted activities
    // that are allowed, but not associated with any activity code.
    return this.tx.withTransaction(async () => {
      // Insert the activity URLs into the activities table
      // with onConflictDoNothing - i.e. only new URLs will be inserted
      await this.mutations.ensureActivitiesExist(urls)

      await this.mutations.removeActivitiesFromActivityCode(activityCodeRecord)
      const activityRecords = await this.queries.findActivitiesByURL(urls)
      await this.mutations.assignActivitiesToActivityCode(activityCodeRecord, activityRecords)

      return toActivityCode(activityCodeRecord)
    })
  }
}

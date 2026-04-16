import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  activityCodeSchema,
  activityCodeWithActivitiesSchema,
  createActivityCodeRequestSchema,
  progressReportSchema,
  progressRequestSchema,
  startActivityRequestSchema,
  startActivityResponseSchema,
  updateActivityCodeRequestSchema,
} from './schemas.js'
import type { ActivityService } from './services/activity.js'
import type { StartActivityService } from './services/start-activity.js'

export class ActivityCommands {
  private utils: CoreUtils
  private activityService: ActivityService
  private startActivityService: StartActivityService

  constructor(deps: {
    utils: CoreUtils
    service: ActivityService
    startService: StartActivityService
  }) {
    this.utils = deps.utils
    this.activityService = deps.service
    this.startActivityService = deps.startService
  }

  @cached get startActivity() {
    return this.utils.createCommand({
      method: 'startActivity',
      auth: {
        mode: 'user',
        abilities: [], // TODO: Should there be an ability for this?
      },
      schemas: {
        input: startActivityRequestSchema,
        output: startActivityResponseSchema,
      },
      handler: this.startActivityService.startActivity.bind(this.startActivityService),
    })
  }

  @cached get listActivityCodes() {
    return this.utils.createCommand({
      method: 'listActivityCodes',
      auth: {
        mode: 'user',
        abilities: ['activity_codes:list_own'],
      },
      schemas: {
        input: z.void(),
        output: activityCodeSchema.array(),
      },
      handler: this.activityService.listActivityCodes.bind(this.activityService),
    })
  }

  @cached get getActivityCode() {
    return this.utils.createCommand({
      method: 'getActivityCode',
      auth: {
        mode: 'user',
        abilities: [], // TODO: Should there be an ability for this?
      },
      schemas: {
        input: z.string(),
        output: activityCodeSchema,
      },
      handler: this.activityService.getActivityCode.bind(this.activityService),
    })
  }

  @cached get getActivitiesByActivityCodeId() {
    return this.utils.createCommand({
      method: 'getActivitiesByActivityCodeId',
      auth: {
        mode: 'user',
        abilities: [], // TODO: Should there be an ability for this?
      },
      schemas: {
        input: z.string(),
        output: activityCodeWithActivitiesSchema,
      },
      handler: this.activityService.getActivitiesByActivityCodeId.bind(this.activityService),
    })
  }

  @cached get getActivityProgress() {
    return this.utils.createCommand({
      method: 'getActivityProgress',
      auth: {
        mode: 'user',
        abilities: [], // TODO: Should there be an ability for this?
      },
      schemas: {
        input: progressRequestSchema,
        output: progressReportSchema,
      },
      handler: this.activityService.getProgress.bind(this.activityService),
    })
  }

  @cached get generateUniqueActivityCode() {
    return this.utils.createCommand({
      method: 'generateUniqueActivityCode',
      auth: {
        mode: 'user',
        abilities: ['activity_codes:create_own'],
      },
      schemas: {
        input: z.void(),
        output: z.string(),
      },
      handler: this.activityService.generateUniqueActivityCode.bind(this.activityService),
    })
  }

  @cached get createActivityCode() {
    return this.utils.createCommand({
      method: 'createActivityCode',
      auth: {
        mode: 'user',
        abilities: ['activity_codes:create_own'],
      },
      schemas: {
        input: createActivityCodeRequestSchema,
        output: activityCodeSchema,
      },
      handler: this.activityService.createActivityCode.bind(this.activityService),
    })
  }

  @cached get updateActivityCode() {
    return this.utils.createCommand({
      method: 'updateActivityCode',
      auth: {
        mode: 'user',
        abilities: [], // TODO: Should there be an ability for this?
      },
      schemas: {
        input: updateActivityCodeRequestSchema,
        output: activityCodeSchema,
      },
      handler: this.activityService.updateActivityCode.bind(this.activityService),
    })
  }
}

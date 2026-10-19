import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  activityCodeMemberSchema,
  activityCodeSchema,
  activityCodeWithActivitiesSchema,
  activityLaunchViewRequestSchema,
  activityLaunchViewResponseSchema,
  addActivityCodeMemberRequestSchema,
  createActivityCodeRequestSchema,
  instructorSearchResultSchema,
  progressReportSchema,
  progressRequestSchema,
  removeActivityCodeMemberRequestSchema,
  searchInstructorsRequestSchema,
  startActivityRequestSchema,
  startActivityResponseSchema,
  updateActivityCodeRequestSchema,
} from './schemas.js'
import type { ActivityService } from './services/activity.js'
import type { ActivityLaunchViewService } from './services/activity-launch-view.js'
import type { StartActivityService } from './services/start-activity.js'

export class ActivityCommands {
  private utils: CoreUtils
  private activityService: ActivityService
  private startActivityService: StartActivityService
  private launchViewService: ActivityLaunchViewService

  constructor(deps: {
    utils: CoreUtils
    service: ActivityService
    startService: StartActivityService
    launchViewService: ActivityLaunchViewService
  }) {
    this.utils = deps.utils
    this.activityService = deps.service
    this.startActivityService = deps.startService
    this.launchViewService = deps.launchViewService
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

  /**
   * Read-only display data for the LTI launch interstitial. Takes no activity
   * code and writes nothing -- see `ActivityLaunchViewService` for why the LTI
   * path must not reuse `startActivity`.
   */
  @cached get getActivityLaunchView() {
    return this.utils.createCommand({
      method: 'getActivityLaunchView',
      auth: {
        mode: 'user',
        abilities: [],
      },
      schemas: {
        input: activityLaunchViewRequestSchema,
        output: activityLaunchViewResponseSchema,
      },
      handler: this.launchViewService.getActivityLaunchView.bind(this.launchViewService),
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
        abilities: ['activity_codes:update_own'],
      },
      schemas: {
        input: updateActivityCodeRequestSchema,
        output: activityCodeSchema,
      },
      handler: this.activityService.updateActivityCode.bind(this.activityService),
    })
  }

  @cached get deleteActivityCode() {
    return this.utils.createCommand({
      method: 'deleteActivityCode',
      auth: {
        mode: 'user',
        abilities: ['activity_codes:delete_own'],
      },
      schemas: {
        input: z.string(),
        output: z.void(),
      },
      handler: this.activityService.deleteActivityCode.bind(this.activityService),
    })
  }

  @cached get listActivityCodeMembers() {
    return this.utils.createCommand({
      method: 'listActivityCodeMembers',
      auth: {
        mode: 'user',
        abilities: ['activity_codes:read_own'],
      },
      schemas: {
        input: z.string(),
        output: activityCodeMemberSchema.array(),
      },
      handler: this.activityService.listActivityCodeMembers.bind(this.activityService),
    })
  }

  @cached get searchInstructors() {
    return this.utils.createCommand({
      method: 'searchInstructors',
      auth: {
        mode: 'user',
        abilities: ['activity_codes:update_own'],
      },
      schemas: {
        input: searchInstructorsRequestSchema,
        output: instructorSearchResultSchema.array(),
      },
      handler: this.activityService.searchInstructors.bind(this.activityService),
    })
  }

  @cached get addActivityCodeMember() {
    return this.utils.createCommand({
      method: 'addActivityCodeMember',
      auth: {
        mode: 'user',
        abilities: ['activity_codes:update_own'],
      },
      schemas: {
        input: addActivityCodeMemberRequestSchema,
        output: activityCodeMemberSchema.array(),
      },
      handler: this.activityService.addActivityCodeMember.bind(this.activityService),
    })
  }

  @cached get removeActivityCodeMember() {
    return this.utils.createCommand({
      method: 'removeActivityCodeMember',
      auth: {
        mode: 'user',
        abilities: ['activity_codes:update_own'],
      },
      schemas: {
        input: removeActivityCodeMemberRequestSchema,
        output: activityCodeMemberSchema.array(),
      },
      handler: this.activityService.removeActivityCodeMember.bind(this.activityService),
    })
  }
}

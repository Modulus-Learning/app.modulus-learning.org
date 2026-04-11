import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  getMonthlyActiveUsersSchemas,
  getNewVsReturningUsersSchemas,
  getRegistrationsPerDaySchemas,
  getRegistrationsPerMonthSchemas,
  getTotalRegisteredUsersSchemas,
} from './schemas.js'
import type { AdminReportService } from './services/admin-reports.js'

export class AdminReportCommands {
  private utils: CoreUtils
  private service: AdminReportService

  constructor(deps: { utils: CoreUtils; service: AdminReportService }) {
    this.utils = deps.utils
    this.service = deps.service
  }

  @cached get getTotalRegisteredUsers() {
    return this.utils.createCommand({
      method: 'getTotalRegisteredUsers',
      auth: {
        mode: 'admin',
        abilities: ['reports:read'],
      },
      schemas: getTotalRegisteredUsersSchemas,
      handler: this.service.getTotalRegisteredUsers.bind(this.service),
    })
  }

  @cached get getRegistrationsPerDay() {
    return this.utils.createCommand({
      method: 'getRegistrationsPerDay',
      auth: {
        mode: 'admin',
        abilities: ['reports:read'],
      },
      schemas: getRegistrationsPerDaySchemas,
      handler: this.service.getRegistrationsPerDay.bind(this.service),
    })
  }

  @cached get getRegistrationsPerMonth() {
    return this.utils.createCommand({
      method: 'getRegistrationsPerMonth',
      auth: {
        mode: 'admin',
        abilities: ['reports:read'],
      },
      schemas: getRegistrationsPerMonthSchemas,
      handler: this.service.getRegistrationsPerMonth.bind(this.service),
    })
  }

  @cached get getMonthlyActiveUsers() {
    return this.utils.createCommand({
      method: 'getMonthlyActiveUsers',
      auth: {
        mode: 'admin',
        abilities: ['reports:read'],
      },
      schemas: getMonthlyActiveUsersSchemas,
      handler: this.service.getMonthlyActiveUsers.bind(this.service),
    })
  }

  @cached get getNewVsReturningUsers() {
    return this.utils.createCommand({
      method: 'getNewVsReturningUsers',
      auth: {
        mode: 'admin',
        abilities: ['reports:read'],
      },
      schemas: getNewVsReturningUsersSchemas,
      handler: this.service.getNewVsReturningUsers.bind(this.service),
    })
  }
}

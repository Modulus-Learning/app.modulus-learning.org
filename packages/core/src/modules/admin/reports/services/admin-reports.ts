import { BaseService, method } from '@/lib/base-service.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AdminReportQueries } from '../repository/index.js'
import type {
  GetMonthlyActiveUsersRequest,
  GetMonthlyActiveUsersResponse,
  GetNewVsReturningUsersRequest,
  GetNewVsReturningUsersResponse,
  GetRegistrationsPerDayRequest,
  GetRegistrationsPerDayResponse,
  GetRegistrationsPerMonthRequest,
  GetRegistrationsPerMonthResponse,
  GetTotalRegisteredUsersResponse,
} from '../schemas.js'

export class AdminReportService extends BaseService {
  private queries: AdminReportQueries

  constructor(deps: { logger: CoreLogger; queries: AdminReportQueries }) {
    super(deps.logger, 'admin', 'reports')
    this.queries = deps.queries
  }

  @method
  async getTotalRegisteredUsers(_auth: AdminAuth): Promise<GetTotalRegisteredUsersResponse> {
    const total = await this.queries.getTotalRegisteredUsers()

    return { total }
  }

  @method
  async getRegistrationsPerDay(
    _auth: AdminAuth,
    request: GetRegistrationsPerDayRequest
  ): Promise<GetRegistrationsPerDayResponse> {
    const today = new Date()
    const year = request.year ?? today.getFullYear()
    const month = request.month ?? today.getMonth() + 1

    const [dailyRegistrations, months, years] = await Promise.all([
      this.queries.getDailyRegistrations(year, month),
      this.queries.getRegistrationMonths(year),
      this.queries.getRegistrationYears(),
    ])

    const cursor = new Date(year, month - 1, 1) // First day of the month
    const endOfMonth = new Date(year, month, 0) // End of the month

    const data: { name: string; value: number }[] = []
    while (endOfMonth >= cursor) {
      const day = cursor.getDate()
      const monthName = cursor.toLocaleString('default', { month: 'short' })
      data.push({
        name: `${day} ${monthName}`,
        value: dailyRegistrations.get(day) ?? 0,
      })
      cursor.setDate(day + 1)
    }

    return {
      data,
      meta: { year, month },
      included: { years, months },
    }
  }

  @method
  async getRegistrationsPerMonth(
    _auth: AdminAuth,
    request: GetRegistrationsPerMonthRequest
  ): Promise<GetRegistrationsPerMonthResponse> {
    const today = new Date()
    const year = request.year ?? today.getFullYear()

    const [monthlyRegistrations, years] = await Promise.all([
      this.queries.getMonthlyRegistrations(year),
      this.queries.getRegistrationYears(),
    ])

    const cursor = new Date(year, 0, 1) // First day year
    const endOfYear = new Date(year, 12, 0) // Last day of year

    const data: { name: string; value: number }[] = []
    while (endOfYear >= cursor) {
      const month = cursor.getMonth() + 1
      const monthName = cursor.toLocaleString('default', { month: 'short' })
      data.push({
        name: monthName,
        value: monthlyRegistrations.get(month) ?? 0,
      })
      cursor.setMonth(month)
    }

    return {
      data,
      meta: { year },
      included: { years },
    }
  }

  @method
  async getMonthlyActiveUsers(
    _auth: AdminAuth,
    request: GetMonthlyActiveUsersRequest
  ): Promise<GetMonthlyActiveUsersResponse> {
    const today = new Date()
    const year = request.year ?? today.getFullYear()

    const [monthlyActiveUsers, years] = await Promise.all([
      this.queries.getMonthlyActiveUsers(year),
      this.queries.getMauYears(),
    ])

    const cursor = new Date(year, 0, 1) // First day year
    const endOfYear = new Date(year, 12, 0) // Last day of year

    const data: { name: string; value: number }[] = []
    while (endOfYear >= cursor) {
      const month = cursor.getMonth() + 1
      const monthName = cursor.toLocaleString('default', { month: 'short' })
      data.push({ name: monthName, value: monthlyActiveUsers.get(month) ?? 0 })
      cursor.setMonth(month)
    }

    return {
      data,
      meta: { year },
      included: { years },
    }
  }

  @method
  async getNewVsReturningUsers(
    _auth: AdminAuth,
    request: GetNewVsReturningUsersRequest
  ): Promise<GetNewVsReturningUsersResponse> {
    const today = new Date()
    const year = request.year ?? today.getFullYear()

    const [monthlyActiveUsers, monthlyRegistrations, years] = await Promise.all([
      this.queries.getMonthlyActiveUsers(year),
      this.queries.getMonthlyRegistrations(year),
      this.queries.getMauYears(),
    ])

    const cursor = new Date(year, 0, 1) // First day year
    const endOfYear = new Date(year, 12, 0) // Last day of year

    const data: { name: string; new: number; returning: number }[] = []
    while (endOfYear >= cursor) {
      const month = cursor.getMonth() + 1
      const monthName = cursor.toLocaleString('default', { month: 'short' })
      const registrations = monthlyRegistrations.get(month) ?? 0
      const activeUsers = monthlyActiveUsers.get(month) ?? 0

      data.push({
        name: monthName,
        new: registrations,
        returning: activeUsers > 0 ? Math.max(activeUsers - registrations, 0) : 0,
        // TODO: Double-check the new calculation of 'returning' is correct.  It
        // used to be activeUsers > 0 ? Math.abs(registrations - activeUsers) : 0.
      })
      cursor.setMonth(month)
    }

    return {
      data,
      meta: { year },
      included: { years },
    }
  }
}

import { and, asc, count, countDistinct, eq, sql } from 'drizzle-orm'

import { userLogins, users } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

const toReportMap = (rows: Array<{ key: number; value: number }>): Map<number, number> => {
  const result = new Map()
  for (const { key, value } of rows) {
    result.set(key, value)
  }
  return result
}

export class AdminReportQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'reports')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getTotalRegisteredUsers(): Promise<number> {
    const [result] = await this.db
      .get()
      .select({ total: count() })
      .from(users)
      .catch(this.utils.wrapDbError('AdminReportQueries.getTotalRegisteredUsers'))

    return result?.total ?? 0
  }

  @method
  async getDailyRegistrations(year: number, month: number): Promise<Map<number, number>> {
    return await this.db
      .get()
      .select({
        key: sql<number>`CAST(EXTRACT(DAY FROM ${users.created_at}) AS INTEGER)`,
        value: count(),
      })
      .from(users)
      .where(
        and(
          sql`EXTRACT(YEAR FROM ${users.created_at}) = ${year}`,
          sql`EXTRACT(MONTH FROM ${users.created_at}) = ${month}`
        )
      )
      .groupBy(sql`EXTRACT(DAY FROM ${users.created_at})`)
      .then(toReportMap)
      .catch(this.utils.wrapDbError('AdminReportQueries.getDailyRegistrations'))
  }

  @method
  async getMonthlyRegistrations(year: number): Promise<Map<number, number>> {
    return await this.db
      .get()
      .select({
        key: sql<number>`CAST(EXTRACT(MONTH FROM ${users.created_at}) AS INTEGER)`,
        value: count(),
      })
      .from(users)
      .where(sql`EXTRACT(YEAR FROM ${users.created_at}) = ${year}`)
      .groupBy(sql`EXTRACT(MONTH FROM ${users.created_at})`)
      .then(toReportMap)
      .catch(this.utils.wrapDbError('AdminReportQueries.getMonthlyRegistrations'))
  }

  @method
  async getRegistrationMonths(year: number): Promise<number[]> {
    return await this.db
      .get()
      .select({
        month: sql<number>`CAST(EXTRACT(MONTH FROM ${users.created_at}) AS INTEGER)`,
      })
      .from(users)
      .where(sql`EXTRACT(YEAR FROM ${users.created_at}) = ${year}`)
      .groupBy(sql`EXTRACT(MONTH FROM ${users.created_at})`)
      .then((rows) => rows.map((row) => row.month))
      .catch(this.utils.wrapDbError('AdminReportQueries.getRegistrationMonths'))
  }

  @method
  async getRegistrationYears(): Promise<number[]> {
    return await this.db
      .get()
      .select({
        year: sql<number>`CAST(EXTRACT(YEAR FROM ${users.created_at}) AS INTEGER)`,
      })
      .from(users)
      .groupBy(sql`EXTRACT(YEAR FROM ${users.created_at})`)
      .then((rows) => rows.map((row) => row.year))
      .catch(this.utils.wrapDbError('AdminReportQueries.getRegistrationYears'))
  }

  @method
  async getMonthlyActiveUsers(year: number): Promise<Map<number, number>> {
    return await this.db
      .get()
      .select({
        key: sql<number>`CAST(EXTRACT(MONTH FROM ${userLogins.time}) AS INTEGER)`,
        value: countDistinct(userLogins.user_id),
      })
      .from(userLogins)
      .where(
        and(eq(userLogins.outcome, 'success'), sql`EXTRACT(YEAR FROM ${userLogins.time}) = ${year}`)
      )
      .groupBy(sql`EXTRACT(MONTH FROM ${userLogins.time})`)
      .then(toReportMap)
      .catch(this.utils.wrapDbError('AdminReportQueries.getMonthlyActiveUsers'))
  }

  @method
  async getMauYears(): Promise<number[]> {
    const [first] = await this.db
      .get()
      .select({
        year: sql<number>`CAST(EXTRACT(YEAR FROM ${userLogins.time}) AS INTEGER)`,
      })
      .from(userLogins)
      .orderBy(asc(userLogins.time))
      .limit(1)
      .catch(this.utils.wrapDbError('AdminReportQueries.getMauYears'))

    const lastYear = new Date().getFullYear()
    const firstYear = first?.year ?? lastYear

    return Array.from({ length: lastYear - firstYear + 1 }, (_, ix) => firstYear + ix)
  }

  // async getMonthlyActiveUsers(year: number): Promise<Map<number, number>> {
  //   return await this.db
  //     .get()
  //     .select({
  //       key: adminReportsMau.month,
  //       value: adminReportsMau.total,
  //     })
  //     .from(adminReportsMau)
  //     .where(eq(adminReportsMau.year, year))
  //     .groupBy(adminReportsMau.month, adminReportsMau.total)
  //     .then(toReportMap)
  //     .catch(this.utils.wrapDbError('AdminReportQueries.getMonthlyActiveUsers'))
  // }

  // async getMauYears(): Promise<number[]> {
  //   return await this.db
  //     .get()
  //     .select({
  //       year: adminReportsMau.year,
  //     })
  //     .from(adminReportsMau)
  //     .groupBy(adminReportsMau.year)
  //     .then((rows) => rows.map((row) => row.year))
  //     .catch(this.utils.wrapDbError('AdminReportQueries.getMauYears'))
  // }
}

// export class AdminReportMutations {
//   constructor(
//     private utils: CoreUtils,
//     private db: DBManager
//   ) {}
// }

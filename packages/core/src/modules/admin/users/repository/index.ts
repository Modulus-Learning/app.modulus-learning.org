import { and, asc, desc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm'

import { permissions, roles, roleUser, users } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import { ERR_DATABASE } from '@/lib/errors.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type UserRecord = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
export type UserForUpdate = Pick<UserRecord, 'id' | 'vid' | 'email'>

export type UserRecordWithRoles = Pick<
  UserRecord,
  'id' | 'vid' | 'full_name' | 'username' | 'email' | 'is_enabled' | 'created_at' | 'updated_at'
> & {
  roles: string[]
}

export type UserRecordWithRolesAndLti = UserRecordWithRoles &
  Pick<UserRecord, 'lti_iss' | 'lti_sub'>

export type UserLtiIdentityRecord = Pick<UserRecord, 'id' | 'vid' | 'lti_iss' | 'lti_sub'>

export type UnlinkLtiIdentityParams = {
  id: string
  vid: number
  lti_iss: string | null
  lti_sub: string | null
}

const SQLSTATE = /^[0-9A-Z]{5}$/

/**
 * The Postgres SQLSTATE of a database error, or null. Walks the `cause` chain
 * (Drizzle wraps the driver error) and accepts only a five-character code, so
 * nothing else from the error can reach a log through this value.
 */
export const sqlStateOf = (error: unknown): string | null => {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current != null && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && SQLSTATE.test(code)) {
      return code
    }
    current = (current as { cause?: unknown }).cause
  }
  return null
}

export type RoleRecord = typeof roles.$inferSelect

export type UserListOptions = {
  page: number
  page_size: number
  order: 'created_at' | 'id' | 'full_name' | 'username' | 'email'
  role: string
  query?: string | undefined
  desc: boolean
}

export class UserQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'users')
    this.utils = deps.utils
    this.db = deps.db
  }

  // This method returns role names in the 'roles' field of
  // UserRecordWithRoles, while getUserWithRoles below returns role
  // ids in that field.  TODO: Refactor so these return the same value (whether
  // its a name or an id), or use a different type name.
  @method
  async getUserList(
    options: UserListOptions
  ): Promise<{ results: UserRecordWithRoles[]; total: number }> {
    const { page, page_size, order, role, query, desc: descending } = options
    const limit = page_size
    const offset = (page - 1) * page_size
    const orderByColumn = users[order]

    const filters: (SQL | undefined)[] = []
    if (role !== 'all') {
      filters.push(eq(roles.machine_name, role))
    }

    if (query != null && query.length > 0) {
      // TODO: query should be escaped / sanitized here (e.g., any % characters
      // it contains should be escaped)
      const searchTerm = `%${query}%`
      filters.push(
        or(
          ilike(users.full_name, searchTerm),
          ilike(users.username, searchTerm),
          ilike(users.email, searchTerm)
        )
      )
    }

    const results = await this.db
      .get()
      .select({
        id: users.id,
        vid: users.vid,
        full_name: users.full_name,
        username: users.username,
        is_enabled: users.is_enabled,
        email: users.email,
        created_at: users.created_at,
        updated_at: users.updated_at,
        // NOTE: FILTER below which we need if we don't want roles: [null] since
        // null will be the result of the leftJoin below if a user has no roles.
        roles: sql<string[]>`
          coalesce(
            array_agg(roles.name ORDER BY roles.order) FILTER (
              WHERE roles.name IS NOT NULL
              AND roles.machine_name != 'everyone'
            ),
            '{}'
          )`,
        // Total still works, despite the leftJoin below because we call
        // .groupBy(adminUsers.id) further down.
        total: sql<number>`cast(count(*) over() as int)`,
      })
      .from(users)
      .leftJoin(roleUser, eq(roleUser.user_id, users.id))
      .leftJoin(roles, and(eq(roles.id, roleUser.role_id)))
      .where(and(...filters))
      .groupBy(users.id)
      .orderBy(
        descending ? desc(orderByColumn) : asc(orderByColumn),
        descending ? desc(users.id) : asc(users.id)
      )
      .limit(limit)
      .offset(offset)
      .catch(this.utils.wrapDbError('UserQueries.getUserList'))

    return {
      results: results.map(({ total, ...rest }) => ({ ...rest })),
      total: results?.[0]?.total ?? 0,
    }
  }

  @method
  async getUser(id: string): Promise<UserRecord | undefined> {
    return await this.db
      .get()
      .query.users.findFirst({ where: eq(users.id, id) })
      .catch(this.utils.wrapDbError('UserQueries.getUser'))
  }

  @method
  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    return await this.db
      .get()
      .query.users.findFirst({
        where: eq(users.email, email),
      })
      .catch(this.utils.wrapDbError('UserQueries.findUserByEmail'))
  }

  @method
  async getUserWithRoles(id: string): Promise<UserRecordWithRolesAndLti | undefined> {
    const [user] = await this.db
      .get()
      .select({
        id: users.id,
        vid: users.vid,
        full_name: users.full_name,
        username: users.username,
        email: users.email,
        is_enabled: users.is_enabled,
        lti_iss: users.lti_iss,
        lti_sub: users.lti_sub,
        created_at: users.created_at,
        updated_at: users.created_at,
        // NOTE: FILTER below which we need if we don't want roles: [null] since
        // null will be the result of the leftJoin below if a user has no roles.
        roles: sql<string[]>`
          coalesce(
            array_agg(roles.id ORDER BY roles.order) FILTER (
              WHERE roles.id IS NOT NULL 
            ),
            '{}'
          )`,
      })
      .from(users)
      .leftJoin(roleUser, eq(roleUser.user_id, users.id))
      .leftJoin(roles, and(eq(roles.id, roleUser.role_id)))
      .where(eq(users.id, id))
      .groupBy(users.id)
      .catch(this.utils.wrapDbError('UserQueries.getUserWithRoles'))

    return user
  }

  @method
  async getAllRoles(): Promise<RoleRecord[]> {
    return await this.db
      .get()
      .select()
      .from(roles)
      .catch(this.utils.wrapDbError('UserQueries.getAllRoles'))
  }

  @method
  async findRoleIdsByMachineName(names: string[]): Promise<string[]> {
    const roleArray = await this.db
      .get()
      .query.roles.findMany({
        where: inArray(roles.machine_name, names),
      })
      .catch(this.utils.wrapDbError('UserQueries.findRoleIdsByMachineName'))

    this.utils.assert(roleArray.length === names.length, {
      message: 'expected roles are missing',
    })

    return roleArray.map((role) => role.id)
  }

  @method
  async getUserAbilities(id: string): Promise<string[]> {
    const result = await this.db
      .get()
      .select({ ability: permissions.ability })
      .from(permissions)
      .innerJoin(roleUser, eq(permissions.role_id, roleUser.role_id))
      .where(eq(roleUser.user_id, id))
      .catch(this.utils.wrapDbError('UserQueries.getUserAbilities'))

    return result.map((row) => row.ability)
  }
}

export class UserMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'admin', 'users')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getUserForUpdate(id: string): Promise<UserForUpdate | undefined> {
    const [adminUser] = await this.db
      .get()
      .select({ id: users.id, vid: users.vid, email: users.email })
      .from(users)
      .for('update')
      .where(eq(users.id, id))
      .catch(this.utils.wrapDbError('UserQueries.getUser'))

    return adminUser
  }

  @method
  async createUser(data: UserInsert): Promise<UserRecord> {
    const [user] = await this.db
      .get()
      .insert(users)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbError('UserMutations.createuser'))

    this.utils.assertExists(user, { message: 'newly created user is null' })

    return user
  }

  @method
  async updateUser(id: string, data: Partial<UserInsert>): Promise<UserRecord | undefined> {
    const [updatedUser] = await this.db
      .get()
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning()
      .catch(this.utils.wrapDbError('UserMutations.updateUser'))

    return updatedUser
  }

  @method
  async deleteUser(id: string): Promise<void> {
    await this.db
      .get()
      .delete(users)
      .where(eq(users.id, id))
      .catch(this.utils.wrapDbError('UserMutations.deleteUserRoles'))
  }

  @method
  async addUserToRoles(user_id: string, role_ids: string[]): Promise<void> {
    if (role_ids.length > 0) {
      await this.db
        .get()
        .insert(roleUser)
        .values(role_ids.map((role_id) => ({ user_id, role_id })))
        .execute()
        .catch(this.utils.wrapDbError('UserMutations.addUserToRoles'))
    }
  }

  /**
   * The current LTI identity and version of a user, for the unlink path.
   * Errors are handled as in `unlinkLtiIdentity`.
   */
  @method
  async getUserLtiIdentity(id: string): Promise<UserLtiIdentityRecord | undefined> {
    const [user] = await this.db
      .get()
      .select({ id: users.id, vid: users.vid, lti_iss: users.lti_iss, lti_sub: users.lti_sub })
      .from(users)
      .where(eq(users.id, id))
      .catch(this.privateDbError('UserMutations.getUserLtiIdentity', id))

    return user
  }

  /**
   * Clears a user's LTI identity while the version and both identity columns
   * still hold the values the caller was shown. Returns the new version, or
   * undefined when no row matched.
   *
   * The query's parameters include the raw LTI subject, and a Drizzle query
   * error carries its full parameter list. So this path does not use the
   * shared `wrapDbError`: see `privateDbError`.
   */
  @method
  async unlinkLtiIdentity({
    id,
    vid,
    lti_iss,
    lti_sub,
  }: UnlinkLtiIdentityParams): Promise<{ vid: number } | undefined> {
    const [updated] = await this.db
      .get()
      .update(users)
      .set({ lti_iss: null, lti_sub: null, vid: sql`${users.vid} + 1`, updated_at: new Date() })
      .where(
        and(
          eq(users.id, id),
          eq(users.vid, vid),
          sql`${users.lti_iss} IS NOT DISTINCT FROM ${lti_iss}`,
          sql`${users.lti_sub} IS NOT DISTINCT FROM ${lti_sub}`
        )
      )
      .returning({ vid: users.vid })
      .catch(this.privateDbError('UserMutations.unlinkLtiIdentity', id))

    return updated
  }

  /**
   * A database error handler for queries whose parameters hold an LTI subject.
   * It throws `ERR_DATABASE` with a fixed message and no `cause`, and logs only
   * the method, the target user id and the SQLSTATE, so neither the log nor
   * the public error can carry the query's parameters.
   */
  private privateDbError(method: string, target_user_id: string) {
    const wrapper = (error: unknown): never => {
      throw ERR_DATABASE(
        {
          message: `database error in ${method}`,
          logExtra: { target_user_id, pg_code: sqlStateOf(error) },
        },
        wrapper
      ).log(this.logger)
    }
    return wrapper
  }

  @method
  async deleteUserRoles(user_id: string): Promise<void> {
    await this.db
      .get()
      .delete(roleUser)
      .where(eq(roleUser.user_id, user_id))
      .catch(this.utils.wrapDbError('UserMutations.deleteUserRoles'))
  }
}

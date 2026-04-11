import { and, eq, inArray } from 'drizzle-orm'

import { permissions, roles, roleUser, userLogins, users } from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type UserRecord = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert
export type RoleRecord = typeof roles.$inferSelect
export type RoleInsert = typeof roles.$inferInsert

export type UserLoginInsert = typeof userLogins.$inferInsert

export class SessionQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: { logger: CoreLogger; utils: CoreUtils; db: DBManager }) {
    super(deps.logger, 'app', 'session')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async getUser(id: string): Promise<UserRecord | undefined> {
    return await this.db
      .get()
      .query.users.findFirst({ where: eq(users.id, id) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    return await this.db
      .get()
      .query.users.findFirst({ where: eq(users.email, email) })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findUserByLtiId(lti_iss: string, lti_sub: string): Promise<UserRecord | undefined> {
    return await this.db
      .get()
      .query.users.findFirst({
        where: and(eq(users.lti_iss, lti_iss), eq(users.lti_sub, lti_sub)),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findUsersByGoogleId(google_id: string): Promise<UserRecord[]> {
    return await this.db
      .get()
      .query.users.findMany({
        where: eq(users.google_id, google_id),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findUsersByGithubId(github_id: number): Promise<UserRecord[]> {
    return await this.db
      .get()
      .query.users.findMany({
        where: eq(users.github_id, github_id),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findRoleIdsByMachineName(names: string[]): Promise<string[]> {
    const roleArray = await this.db
      .get()
      .query.roles.findMany({
        where: inArray(roles.machine_name, names),
      })
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assert(roleArray.length === names.length, { message: 'expected roles are missing' })

    return roleArray.map((role) => role.id)
  }

  @method
  async getUserAbilities(user_id: string): Promise<string[]> {
    const result = await this.db
      .get()
      .select({ ability: permissions.ability })
      .from(permissions)
      .innerJoin(roleUser, eq(permissions.role_id, roleUser.role_id))
      .where(eq(roleUser.user_id, user_id))
      .catch(this.utils.wrapDbErrorNew())

    // TODO: Why is ability nullable?
    return result.map((row) => row.ability).filter((ability) => ability != null)
  }
}

export class SessionMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: { logger: CoreLogger; utils: CoreUtils; db: DBManager }) {
    super(deps.logger, 'app', 'session')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async createUser(data: UserInsert): Promise<UserRecord> {
    const [user] = await this.db
      .get()
      .insert(users)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(user, { message: 'newly created user is null' })

    return user
  }

  @method
  async updateUser(user: UserRecord, data: Partial<UserInsert>): Promise<UserRecord> {
    const [updatedUser] = await this.db
      .get()
      .update(users)
      .set(data)
      .where(eq(users.id, user.id))
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(updatedUser, { message: 'updated user is null' })

    return updatedUser
  }

  @method
  async addUserToRoles(user_id: string, roleIds: string[]): Promise<void> {
    await this.db
      .get()
      .insert(roleUser)
      .values(roleIds.map((role_id) => ({ user_id, role_id })))
      .onConflictDoNothing()
      .execute()
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async recordLogin(data: UserLoginInsert): Promise<void> {
    await this.db.get().insert(userLogins).values(data).execute().catch(this.utils.wrapDbErrorNew())
  }
}

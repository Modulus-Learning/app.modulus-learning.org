import { eq, inArray, lt } from 'drizzle-orm'

import {
  permissions,
  registrations,
  roles,
  roleUser,
  userLogins,
  users,
} from '@/database/schema/index.js'
import { BaseService, method } from '@/lib/base-service.js'
import type { DBManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { CoreUtils } from '@/lib/utils.js'

export type UserRecord = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert

export type RegistrationRecord = typeof registrations.$inferSelect
export type RegistrationInsert = typeof registrations.$inferInsert

export type UserLoginInsert = typeof userLogins.$inferInsert

export class RegistrationQueries extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'app', 'registration')
    this.utils = deps.utils
    this.db = deps.db
  }

  @method
  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    return await this.db
      .get()
      .query.users.findFirst({
        where: eq(users.email, email),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async getRegistration(id: string): Promise<RegistrationRecord | undefined> {
    return await this.db
      .get()
      .query.registrations.findFirst({
        where: eq(registrations.id, id),
      })
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async findRegistrationByEmail(email: string): Promise<RegistrationRecord | undefined> {
    return await this.db
      .get()
      .query.registrations.findFirst({
        where: eq(registrations.email, email),
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

export class RegistrationMutations extends BaseService {
  private utils: CoreUtils
  private db: DBManager

  constructor(deps: {
    logger: CoreLogger
    utils: CoreUtils
    db: DBManager
  }) {
    super(deps.logger, 'app', 'registration')
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
  async addUserToRoles(user_id: string, roleIds: string[]): Promise<void> {
    await this.db
      .get()
      .insert(roleUser)
      .values(roleIds.map((role_id) => ({ user_id, role_id })))
      .execute()
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async createRegistration(data: RegistrationInsert): Promise<RegistrationRecord> {
    const [registration] = await this.db
      .get()
      .insert(registrations)
      .values(data)
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(registration, { message: 'newly created registration is null' })

    return registration
  }

  @method
  async updateRegistration(
    id: string,
    data: Partial<RegistrationInsert>
  ): Promise<RegistrationRecord> {
    const [registration] = await this.db
      .get()
      .update(registrations)
      .set(data)
      .where(eq(registrations.id, id))
      .returning()
      .catch(this.utils.wrapDbErrorNew())

    this.utils.assertExists(registration, { message: 'updated registration is null' })

    return registration
  }

  @method
  async deleteRegistration(id: string): Promise<void> {
    await this.db
      .get()
      .delete(registrations)
      .where(eq(registrations.id, id))
      .execute()
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async pruneRegistrations(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    await this.db
      .get()
      .delete(registrations)
      .where(lt(registrations.created_at, oneHourAgo))
      .execute()
      .catch(this.utils.wrapDbErrorNew())
  }

  @method
  async recordLogin(data: UserLoginInsert): Promise<void> {
    await this.db.get().insert(userLogins).values(data).execute().catch(this.utils.wrapDbErrorNew())
  }
}

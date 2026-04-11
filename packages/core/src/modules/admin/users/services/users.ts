import argon2 from 'argon2'
import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_NOT_FOUND, ERR_VERSION_CONFLICT } from '@/lib/errors.js'
import { arrayContentsMatch } from '@/lib/utils.js'
import { ERR_USER_EMAIL_CONFLICT } from '../errors.js'
import { toAddUserResponse, toUser, toUserResponse } from '../utils.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { Mailer } from '@/lib/email/services/mailer.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { UserInsert, UserMutations, UserQueries } from '../repository/index.js'
import type {
  AddUserResponse,
  CreateUserRequest,
  CreateUserResponse,
  DeleteUserRequest,
  GetUserRequest,
  ListUsersRequest,
  UpdateUserRequest,
  UserListResponse,
  UserResponse,
} from '../schemas.js'

export class UserService extends BaseService {
  private tx: TXManager
  private mailer: Mailer
  private queries: UserQueries
  private mutations: UserMutations

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    mailer: Mailer
    queries: UserQueries
    mutations: UserMutations
  }) {
    super(deps.logger, 'admin', 'users')
    this.tx = deps.tx
    this.mailer = deps.mailer
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async listUsers(_adminAuth: AdminAuth, request: ListUsersRequest): Promise<UserListResponse> {
    const { results, total } = await this.queries.getUserList(request)
    const total_pages = Math.ceil(total / request.page_size)

    return {
      users: results.map(toUser),
      meta: {
        total,
        total_pages,
        ...request,
      },
    }
  }

  @method
  async getUser(_adminAuth: AdminAuth, request: GetUserRequest): Promise<UserResponse> {
    const user = await this.queries.getUserWithRoles(request.id)
    if (user == null) {
      throw ERR_NOT_FOUND({ message: 'User not found' })
    }

    const roles = await this.queries.getAllRoles()

    return toUserResponse(user, roles)
  }

  @method
  async addUser(_adminAuth: AdminAuth): Promise<AddUserResponse> {
    const roles = await this.queries.getAllRoles()

    return toAddUserResponse(roles)
  }

  @method
  async createUser(_adminAuth: AdminAuth, request: CreateUserRequest): Promise<CreateUserResponse> {
    const existingUser = await this.queries.findUserByEmail(request.email)
    if (existingUser != null) {
      throw ERR_USER_EMAIL_CONFLICT({ message: 'Email address in use' })
    }

    const password = await argon2.hash(request.password)

    const [everyoneRoleId] = await this.queries.findRoleIdsByMachineName(['everyone'])
    if (everyoneRoleId != null && !request.roles.includes(everyoneRoleId)) {
      request.roles.push(everyoneRoleId)
    }

    const user = await this.tx.withTransaction(async () => {
      const user = await this.mutations.createUser({
        id: uuidv7(),
        full_name: request.full_name,
        password,
        email: request.email,
        is_email_verified: true,
        is_enabled: true,
      })

      await this.mutations.addUserToRoles(user.id, request.roles)

      return user
    })

    if (request.send_welcome) {
      await this.mailer.sendTemplateEmail({
        to: request.email,
        subject: 'Welcome to Modulus',
        templateName: 'welcome',
        templateData: { full_name: `${request.full_name}` },
      })
    }

    this.logger.info({ user_id: user.id }, 'new user created')

    return {
      user: {
        id: user.id,
        email: user.email ?? '',
        full_name: user.full_name ?? '',
        created_at: user.created_at.toISOString(),
        roles: request.roles,
      },
    }
  }

  @method
  async updateUser(_adminAuth: AdminAuth, request: UpdateUserRequest): Promise<void> {
    const updatedFields: Partial<UserInsert> = {
      vid: request.vid + 1,
      full_name: request.full_name,
      email: request.email,
      is_enabled: request.is_enabled,
      updated_at: new Date(),
    }

    if (request.password != null && request.password.length > 0) {
      updatedFields.password = await argon2.hash(request.password)
    }

    await this.tx.withTransaction(async () => {
      const currentUser = await this.mutations.getUserForUpdate(request.id)
      if (currentUser == null) {
        throw ERR_NOT_FOUND({ message: `User with ID ${request.id} not found` })
      }

      if (currentUser.vid !== request.vid) {
        throw ERR_VERSION_CONFLICT({ message: 'Stale data - please refresh and try again' })
      }

      // If changing email, make sure new email isn't already taken. Note: we
      // could also just optimistically do the update, allow the db layer to
      // throw an error on conflict, catch that error, and convert it to
      // ERR_USER_EMAIL_CONFLICT.
      if (request.email !== currentUser.email) {
        const existingUser = await this.queries.findUserByEmail(request.email)
        if (existingUser != null) {
          throw ERR_USER_EMAIL_CONFLICT({ message: 'Email address in use' })
        }
      }

      await this.mutations.updateUser(request.id, updatedFields)

      if (!arrayContentsMatch(request.roles, request.previous_roles)) {
        const [everyoneRoleId] = await this.queries.findRoleIdsByMachineName(['everyone'])
        if (everyoneRoleId != null && !request.roles.includes(everyoneRoleId)) {
          request.roles.push(everyoneRoleId)
        }

        await this.mutations.deleteUserRoles(request.id)
        await this.mutations.addUserToRoles(request.id, request.roles)
      }
    })
  }

  @method
  async deleteUser(_adminAuth: AdminAuth, request: DeleteUserRequest): Promise<void> {
    await this.mutations.deleteUser(request.id)
  }
}

import argon2 from 'argon2'
import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_NOT_FOUND, ERR_VERSION_CONFLICT } from '@/lib/errors.js'
import { arrayContentsMatch } from '@/lib/utils.js'
import { ERR_ADMIN_USER_EMAIL_CONFLICT } from '../errors.js'
import { toAddAdminUserResponse, toAdminUser, toAdminUserResponse } from '../utils.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { Mailer } from '@/lib/email/services/mailer.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AdminUserInsert, AdminUserMutations, AdminUserQueries } from '../repository/index.js'
import type {
  AddAdminUserResponse,
  AdminUserListResponse,
  AdminUserResponse,
  CreateAdminUserRequest,
  CreateAdminUserResponse,
  DeleteAdminUserRequest,
  GetAdminUserRequest,
  ListAdminUsersRequest,
  UpdateAdminUserRequest,
} from '../schemas.js'

export class AdminUserService extends BaseService {
  private tx: TXManager
  private mailer: Mailer
  private queries: AdminUserQueries
  private mutations: AdminUserMutations

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    mailer: Mailer
    queries: AdminUserQueries
    mutations: AdminUserMutations
  }) {
    super(deps.logger, 'admin', 'admin-users')
    this.tx = deps.tx
    this.mailer = deps.mailer
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async listAdminUsers(
    _adminAuth: AdminAuth,
    request: ListAdminUsersRequest
  ): Promise<AdminUserListResponse> {
    const { results, total } = await this.queries.getAdminUserList(request)
    const total_pages = Math.ceil(total / request.page_size)

    return {
      users: results.map(toAdminUser),
      meta: {
        total,
        total_pages,
        ...request,
      },
    }
  }

  @method
  async getAdminUser(
    _adminAuth: AdminAuth,
    request: GetAdminUserRequest
  ): Promise<AdminUserResponse> {
    const adminUser = await this.queries.getAdminUserWithRoles(request.id)
    if (adminUser == null) {
      throw ERR_NOT_FOUND({
        message: 'Admin user not found',
      }).log(this.logger)
    }

    const adminRoles = await this.queries.getAllAdminRoles()

    return toAdminUserResponse(adminUser, adminRoles)
  }

  @method
  async addAdminUser(_adminAuth: AdminAuth): Promise<AddAdminUserResponse> {
    const adminRoles = await this.queries.getAllAdminRoles()

    return toAddAdminUserResponse(adminRoles)
  }

  @method
  async createAdminUser(
    _adminAuth: AdminAuth,
    request: CreateAdminUserRequest
  ): Promise<CreateAdminUserResponse> {
    const existingAdminUser = await this.queries.findAdminUserByEmail(request.email)
    if (existingAdminUser != null) {
      throw ERR_ADMIN_USER_EMAIL_CONFLICT({
        message: 'Email address in use',
      }).log(this.logger)
    }

    // TODO: Should we add a query here to ensure the specified roles exist?
    // const adminRoleIds = await this.queries.findAdminRoleIdsByMachineName(request.roles)

    const password = await argon2.hash(request.password)

    const adminUser = await this.tx.withTransaction(async () => {
      const adminUser = await this.mutations.createAdminUser({
        id: uuidv7(),
        given_name: request.given_name,
        family_name: request.family_name,
        password,
        email: request.email,
        is_email_verified: true,
        is_enabled: true,
      })

      await this.mutations.addAdminUserToRoles(adminUser.id, request.roles)

      return adminUser
    })

    if (request.send_welcome) {
      await this.mailer.sendTemplateEmail({
        to: request.email,
        subject: 'Welcome to Modulus Admin Area',
        templateName: 'welcome',
        templateData: { full_name: `${request.given_name} ${request.family_name}` },
      })
    }

    // TODO: Clean up nullability (in db table and/or request and/or response)
    return {
      user: {
        id: adminUser.id,
        email: request.email,
        given_name: request.given_name,
        family_name: request.family_name,
        created_at: adminUser.created_at?.toISOString(),
        roles: request.roles,
      },
    }
  }

  @method
  async updateAdminUser(_adminAuth: AdminAuth, request: UpdateAdminUserRequest): Promise<void> {
    // TODO: should we get previous_roles from the database instead of the
    // request?
    const { vid, roles, previous_roles, password, ...rest } = request

    // Prepare updated user data (excluding roles and password)
    const updatedFields: Partial<AdminUserInsert> = {
      vid: vid + 1,
      updated_at: new Date(),
      ...rest,
    }

    if (password != null && password.length > 0) {
      const hashedPassword = await argon2.hash(password)
      updatedFields.password = hashedPassword
    }

    await this.tx.withTransaction(async () => {
      const currentAdminUser = await this.mutations.getAdminUserForUpdate(request.id)
      if (currentAdminUser == null) {
        throw ERR_NOT_FOUND({
          message: `AdminUser with ID ${request.id} not found`,
        }).log(this.logger)
      }

      // Check for stale data
      if (currentAdminUser.vid !== request.vid) {
        throw ERR_VERSION_CONFLICT({
          message: 'Stale data - please refresh and try again',
        }).log(this.logger)
      }

      // If changing email, make sure new email isn't already taken. Note: we
      // could also just optimistically do the update, allow the db layer to
      // throw an error on conflict, catch that error, and convert it to
      // ERR_ADMIN_USER_EMAIL_CONFLICT.
      if (request.email !== currentAdminUser.email) {
        const existingAdminUser = await this.queries.findAdminUserByEmail(request.email)
        if (existingAdminUser != null) {
          throw ERR_ADMIN_USER_EMAIL_CONFLICT({
            message: 'Email address in use',
          }).log(this.logger)
        }
      }

      await this.mutations.updateAdminUser(request.id, updatedFields)

      if (!arrayContentsMatch(roles, previous_roles)) {
        await this.mutations.deleteAdminUserRoles(request.id)
        await this.mutations.addAdminUserToRoles(request.id, roles)
      }
    })
  }

  @method
  async deleteAdminUser(_adminAuth: AdminAuth, request: DeleteAdminUserRequest): Promise<void> {
    // Should we add a check ensuring an admin user cannot accidentally delete
    // their own account?

    await this.mutations.deleteAdminUser(request.id)
  }
}

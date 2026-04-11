import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_NOT_FOUND, ERR_VERSION_CONFLICT } from '@/lib/errors.js'
import { ERR_ADMIN_ROLE_MACHINE_NAME_CONFLICT } from '../errors.js'
import { toAdminPermission, toAdminRole } from '../utils.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AdminRoleMutations, AdminRoleQueries } from '../repository/index.js'
import type {
  AdminRoleListResponse,
  AdminRoleResponse,
  CreateAdminRoleRequest,
  DeleteAdminRoleRequest,
  GetAdminRoleRequest,
  UpdateAdminRoleRequest,
  UpdateAdminRolesOrderRequest,
} from '../schemas.js'

export class AdminRoleService extends BaseService {
  private tx: TXManager
  private queries: AdminRoleQueries
  private mutations: AdminRoleMutations

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    queries: AdminRoleQueries
    mutations: AdminRoleMutations
  }) {
    super(deps.logger, 'admin', 'admin-roles')
    this.tx = deps.tx
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async listAdminRoles(_adminAuth: AdminAuth): Promise<AdminRoleListResponse> {
    const roles = await this.queries.getAdminRoleList()

    return {
      roles: roles.map(toAdminRole),
    }
  }

  @method
  async getAdminRole(
    _adminAuth: AdminAuth,
    request: GetAdminRoleRequest
  ): Promise<AdminRoleResponse> {
    const adminRoleRecord = await this.queries.getAdminRole(request.id)
    if (adminRoleRecord == null) {
      throw ERR_NOT_FOUND({
        message: 'Admin role not found',
      }).log(this.logger)
    }

    const permissionRecords = await this.queries.getPermissionsForAdminRole(adminRoleRecord.id)

    return {
      role: toAdminRole(adminRoleRecord),
      permissions: permissionRecords.map(toAdminPermission),
    }
  }

  @method
  async createAdminRole(
    _adminAuth: AdminAuth,
    request: CreateAdminRoleRequest
  ): Promise<AdminRoleResponse> {
    const existingAdminRole = await this.queries.findAdminRoleByMachineName(request.machine_name)
    if (existingAdminRole != null) {
      throw ERR_ADMIN_ROLE_MACHINE_NAME_CONFLICT({
        message: 'Admin role machine name is in use.',
      }).log(this.logger)
    }

    const adminRoleRecord = await this.mutations.createAdminRole({
      id: uuidv7(),
      name: request.name,
      machine_name: request.machine_name,
      description: request.description,
    })

    return {
      role: toAdminRole(adminRoleRecord),
      permissions: [],
    }
  }

  @method
  async updateAdminRole(_adminAuth: AdminAuth, request: UpdateAdminRoleRequest): Promise<void> {
    await this.tx.withTransaction(async () => {
      const currentAdminRole = await this.mutations.getAdminRoleForUpdate(request.id)
      if (!currentAdminRole) {
        throw ERR_NOT_FOUND({
          message: 'Admin role not found',
        }).log(this.logger)
      }

      // Check for stale data
      if (currentAdminRole.vid !== request.vid) {
        throw ERR_VERSION_CONFLICT({
          message: 'Stale data - please refresh and try again',
        }).log(this.logger)
      }

      // If changing machine_name, make sure new machine_name isn't already taken.
      // Note: we could also just optimistically do the update, allow the db
      // layer to throw an error on conflict, catch that error, and convert it
      // to ERR_ADMIN_ROLE_MACHINE_NAME_CONFLICT.
      if (request.machine_name !== currentAdminRole.machine_name) {
        const existingAdminRole = await this.queries.findAdminRoleByMachineName(
          request.machine_name
        )
        if (existingAdminRole != null) {
          throw ERR_ADMIN_ROLE_MACHINE_NAME_CONFLICT({
            message: 'Machine name is in use',
          }).log(this.logger)
        }
      }

      await this.mutations.updateAdminRole(request.id, {
        vid: request.vid + 1,
        machine_name: request.machine_name,
        name: request.name,
        description: request.description,
        updated_at: new Date(),
      })
    })
  }

  @method
  async deleteAdminRole(_adminAuth: AdminAuth, request: DeleteAdminRoleRequest): Promise<void> {
    await this.mutations.deleteAdminRole(request.id)
  }

  @method
  async updateAdminRolesOrder(
    _adminAuth: AdminAuth,
    request: UpdateAdminRolesOrderRequest
  ): Promise<void> {
    // TODO: Add defensive check: the set of ids in request.ids should match
    // the set of ids in the adminRoles table.

    await this.mutations.setAdminRolesOrder(request.ids)
  }
}

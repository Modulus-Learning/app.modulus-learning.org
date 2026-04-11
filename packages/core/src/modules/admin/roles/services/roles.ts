import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_NOT_FOUND, ERR_VERSION_CONFLICT } from '@/lib/errors.js'
import { ERR_ROLE_MACHINE_NAME_CONFLICT } from '../errors.js'
import { toPermission, toRole } from '../utils.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { RoleMutations, RoleQueries } from '../repository/index.js'
import type {
  CreateRoleRequest,
  DeleteRoleRequest,
  GetRoleRequest,
  RoleListResponse,
  RoleResponse,
  UpdateRoleRequest,
  UpdateRolesOrderRequest,
} from '../schemas.js'

export class RoleService extends BaseService {
  private tx: TXManager
  private queries: RoleQueries
  private mutations: RoleMutations

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    queries: RoleQueries
    mutations: RoleMutations
  }) {
    super(deps.logger, 'admin', 'roles')
    this.tx = deps.tx
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async listRoles(_adminAuth: AdminAuth): Promise<RoleListResponse> {
    const roles = await this.queries.getRoleList()

    return {
      roles: roles.map(toRole),
    }
  }

  @method
  async getRole(_adminAuth: AdminAuth, request: GetRoleRequest): Promise<RoleResponse> {
    const roleRecord = await this.queries.getRole(request.id)
    if (roleRecord == null) {
      throw ERR_NOT_FOUND({
        message: 'Role not found',
      }).log(this.logger)
    }

    const permissionRecords = await this.queries.getPermissionsForRole(roleRecord.id)

    return {
      role: toRole(roleRecord),
      permissions: permissionRecords.map(toPermission),
    }
  }

  @method
  async createRole(_adminAuth: AdminAuth, request: CreateRoleRequest): Promise<RoleResponse> {
    const existingRole = await this.queries.findRoleByMachineName(request.machine_name)
    if (existingRole != null) {
      throw ERR_ROLE_MACHINE_NAME_CONFLICT({
        message: 'Role machine name is in use.',
      }).log(this.logger)
    }

    const roleRecord = await this.mutations.createRole({
      id: uuidv7(),
      name: request.name,
      machine_name: request.machine_name,
      description: request.description,
    })

    return {
      role: toRole(roleRecord),
      permissions: [],
    }
  }

  @method
  async updateRole(_adminAuth: AdminAuth, request: UpdateRoleRequest): Promise<void> {
    await this.tx.withTransaction(async () => {
      const currentRole = await this.mutations.getRoleForUpdate(request.id)
      if (!currentRole) {
        throw ERR_NOT_FOUND({
          message: 'Role not found',
          logExtra: { role_id: request.id },
        }).log(this.logger)
      }

      // Check for stale data
      if (currentRole.vid !== request.vid) {
        throw ERR_VERSION_CONFLICT({
          message: 'Stale data - please refresh and try again',
        }).log(this.logger)
      }

      // If changing machine_name, make sure new machine_name isn't already taken.
      // Note: we could also just optimistically do the update, allow the db
      // layer to throw an error on conflict, catch that error, and convert it
      // to ERR_ROLE_MACHINE_NAME_CONFLICT.
      if (request.machine_name !== currentRole.machine_name) {
        const existingAdminRole = await this.queries.findRoleByMachineName(request.machine_name)
        if (existingAdminRole != null) {
          throw ERR_ROLE_MACHINE_NAME_CONFLICT({
            message: 'Machine name is in use',
          }).log(this.logger)
        }
      }

      await this.mutations.updateRole(request.id, {
        vid: request.vid + 1,
        machine_name: request.machine_name,
        name: request.name,
        description: request.description,
        updated_at: new Date(),
      })
    })
  }

  @method
  async deleteRole(_adminAuth: AdminAuth, request: DeleteRoleRequest): Promise<void> {
    await this.mutations.deleteRole(request.id)
  }

  @method
  async updateRolesOrder(_adminAuth: AdminAuth, request: UpdateRolesOrderRequest): Promise<void> {
    // TODO: Add defensive check: the set of ids in request.ids should match
    // the set of ids in the roles table.

    await this.mutations.setRolesOrder(request.ids)
  }
}

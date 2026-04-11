import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  createRoleRequestSchema,
  deleteRoleRequestSchema,
  getRoleRequestSchema,
  roleListResponseSchema,
  roleResponseSchema,
  updateRoleRequestSchema,
  updateRolesOrderRequestSchema,
} from './schemas.js'
import type { RoleService } from './services/roles.js'

export class RoleCommands {
  private utils: CoreUtils
  private service: RoleService

  constructor(deps: { utils: CoreUtils; service: RoleService }) {
    this.utils = deps.utils
    this.service = deps.service
  }

  @cached get listRoles() {
    return this.utils.createCommand({
      method: 'listRoles',
      auth: {
        mode: 'admin',
        abilities: ['roles:list'],
      },
      schemas: {
        input: z.void(),
        output: roleListResponseSchema,
      },
      handler: this.service.listRoles.bind(this.service),
    })
  }

  @cached get getRole() {
    return this.utils.createCommand({
      method: 'getRole',
      auth: {
        mode: 'admin',
        abilities: ['roles:read'],
      },
      schemas: {
        input: getRoleRequestSchema,
        output: roleResponseSchema,
      },
      handler: this.service.getRole.bind(this.service),
    })
  }

  @cached get createRole() {
    return this.utils.createCommand({
      method: 'createRole',
      auth: {
        mode: 'admin',
        abilities: ['roles:create'],
      },
      schemas: {
        input: createRoleRequestSchema,
        output: roleResponseSchema,
      },
      handler: this.service.createRole.bind(this.service),
    })
  }

  @cached get updateRole() {
    return this.utils.createCommand({
      method: 'updateRole',
      auth: {
        mode: 'admin',
        abilities: ['roles:edit'],
      },
      schemas: {
        input: updateRoleRequestSchema,
        output: z.void(),
      },
      handler: this.service.updateRole.bind(this.service),
    })
  }

  @cached get deleteRole() {
    return this.utils.createCommand({
      method: 'deleteRole',
      auth: {
        mode: 'admin',
        abilities: ['roles:delete'],
      },
      schemas: {
        input: deleteRoleRequestSchema,
        output: z.void(),
      },
      handler: this.service.deleteRole.bind(this.service),
    })
  }

  @cached get updateRolesOrder() {
    return this.utils.createCommand({
      method: 'updateRolesOrder',
      auth: {
        mode: 'admin',
        abilities: ['roles:edit'],
      },
      schemas: {
        input: updateRolesOrderRequestSchema,
        output: z.void(),
      },
      handler: this.service.updateRolesOrder.bind(this.service),
    })
  }
}

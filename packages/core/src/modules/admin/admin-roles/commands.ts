import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  adminRoleListResponseSchema,
  adminRoleResponseSchema,
  createAdminRoleRequestSchema,
  deleteAdminRoleRequestSchema,
  getAdminRoleRequestSchema,
  updateAdminRoleRequestSchema,
  updateAdminRolesOrderRequestSchema,
} from './schemas.js'
import type { AdminRoleService } from './services/admin-roles.js'

export class AdminRoleCommands {
  private utils: CoreUtils
  private service: AdminRoleService

  constructor(deps: { utils: CoreUtils; service: AdminRoleService }) {
    this.utils = deps.utils
    this.service = deps.service
  }

  @cached get listAdminRoles() {
    return this.utils.createCommand({
      method: 'listAdminRoles',
      auth: {
        mode: 'admin',
        abilities: ['admin-roles:list'],
      },
      schemas: {
        input: z.void(),
        output: adminRoleListResponseSchema,
      },
      handler: this.service.listAdminRoles.bind(this.service),
    })
  }

  @cached get getAdminRole() {
    return this.utils.createCommand({
      method: 'getAdminRole',
      auth: {
        mode: 'admin',
        abilities: ['admin-roles:read'],
      },
      schemas: {
        input: getAdminRoleRequestSchema,
        output: adminRoleResponseSchema,
      },
      handler: this.service.getAdminRole.bind(this.service),
    })
  }

  @cached get createAdminRole() {
    return this.utils.createCommand({
      method: 'createAdminRole',
      auth: {
        mode: 'admin',
        abilities: ['admin-roles:create'],
      },
      schemas: {
        input: createAdminRoleRequestSchema,
        output: adminRoleResponseSchema,
      },
      handler: this.service.createAdminRole.bind(this.service),
    })
  }

  @cached get updateAdminRole() {
    return this.utils.createCommand({
      method: 'updateAdminRole',
      auth: {
        mode: 'admin',
        abilities: ['admin-roles:edit'],
      },
      schemas: {
        input: updateAdminRoleRequestSchema,
        output: z.void(),
      },
      handler: this.service.updateAdminRole.bind(this.service),
    })
  }

  @cached get deleteAdminRole() {
    return this.utils.createCommand({
      method: 'deleteAdminRole',
      auth: {
        mode: 'admin',
        abilities: ['admin-roles:delete'],
      },
      schemas: {
        input: deleteAdminRoleRequestSchema,
        output: z.void(),
      },
      handler: this.service.deleteAdminRole.bind(this.service),
    })
  }

  @cached get updateAdminRolesOrder() {
    return this.utils.createCommand({
      method: 'updateAdminRolesOrder',
      auth: {
        mode: 'admin',
        abilities: ['admin-roles:edit'],
      },
      schemas: {
        input: updateAdminRolesOrderRequestSchema,
        output: z.void(),
      },
      handler: this.service.updateAdminRolesOrder.bind(this.service),
    })
  }
}

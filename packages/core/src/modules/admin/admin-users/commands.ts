import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  addAdminUserResponseSchema,
  adminUserListResponseSchema,
  adminUserResponseSchema,
  createAdminUserRequestSchema,
  createAdminUserResponseSchema,
  deleteAdminUserRequestSchema,
  getAdminUserRequestSchema,
  listAdminUsersRequestSchema,
  updateAdminUserRequestSchema,
} from './schemas.js'
import type { AdminUserService } from './services/admin-users.js'

export class AdminUserCommands {
  private utils: CoreUtils
  private service: AdminUserService

  constructor(deps: { utils: CoreUtils; service: AdminUserService }) {
    this.utils = deps.utils
    this.service = deps.service
  }

  @cached get listAdminUsers() {
    return this.utils.createCommand({
      method: 'listAdminUsers',
      auth: {
        mode: 'admin',
        abilities: ['admin-users:list'],
      },
      schemas: {
        input: listAdminUsersRequestSchema,
        output: adminUserListResponseSchema,
      },
      handler: this.service.listAdminUsers.bind(this.service),
    })
  }

  @cached get getAdminUser() {
    return this.utils.createCommand({
      method: 'getAdminUser',
      auth: {
        mode: 'admin',
        abilities: ['admin-users:read'],
      },
      schemas: {
        input: getAdminUserRequestSchema,
        output: adminUserResponseSchema,
      },
      handler: this.service.getAdminUser.bind(this.service),
    })
  }

  @cached get addAdminUser() {
    return this.utils.createCommand({
      method: 'addAdminUser',
      auth: {
        mode: 'admin',
        abilities: ['admin-users:create'],
      },
      schemas: {
        input: z.void(),
        output: addAdminUserResponseSchema,
      },
      handler: this.service.addAdminUser.bind(this.service),
    })
  }

  @cached get createAdminUser() {
    return this.utils.createCommand({
      method: 'createAdminUser',
      auth: {
        mode: 'admin',
        abilities: ['admin-users:create'],
      },
      schemas: {
        input: createAdminUserRequestSchema,
        output: createAdminUserResponseSchema,
      },
      handler: this.service.createAdminUser.bind(this.service),
    })
  }

  @cached get updateAdminUser() {
    return this.utils.createCommand({
      method: 'updateAdminUser',
      auth: {
        mode: 'admin',
        abilities: ['admin-users:edit'],
      },
      schemas: {
        input: updateAdminUserRequestSchema,
        output: z.void(),
      },
      handler: this.service.updateAdminUser.bind(this.service),
    })
  }

  @cached get deleteAdminUser() {
    return this.utils.createCommand({
      method: 'deleteAdminUser',
      auth: {
        mode: 'admin',
        abilities: ['admin-users:delete'],
      },
      schemas: {
        input: deleteAdminUserRequestSchema,
        output: z.void(),
      },
      handler: this.service.deleteAdminUser.bind(this.service),
    })
  }
}

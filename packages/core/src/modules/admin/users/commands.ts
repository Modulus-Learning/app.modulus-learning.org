import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  addUserResponseSchema,
  createUserRequestSchema,
  createUserResponseSchema,
  deleteUserRequestSchema,
  getUserRequestSchema,
  listUsersRequestSchema,
  updateUserRequestSchema,
  userListResponseSchema,
  userResponseSchema,
} from './schemas.js'
import type { UserService } from './services/users.js'

export class UserCommands {
  private utils: CoreUtils
  private service: UserService

  constructor(deps: { utils: CoreUtils; service: UserService }) {
    this.utils = deps.utils
    this.service = deps.service
  }

  @cached get listUsers() {
    return this.utils.createCommand({
      method: 'listUsers',
      auth: {
        mode: 'admin',
        abilities: ['users:list'],
      },
      schemas: {
        input: listUsersRequestSchema,
        output: userListResponseSchema,
      },
      handler: this.service.listUsers.bind(this.service),
    })
  }

  @cached get getUser() {
    return this.utils.createCommand({
      method: 'getUser',
      auth: {
        mode: 'admin',
        abilities: ['users:read'],
      },
      schemas: {
        input: getUserRequestSchema,
        output: userResponseSchema,
      },
      handler: this.service.getUser.bind(this.service),
    })
  }

  @cached get addUser() {
    return this.utils.createCommand({
      method: 'addUser',
      auth: {
        mode: 'admin',
        abilities: ['users:create'],
      },
      schemas: {
        input: z.void(),
        output: addUserResponseSchema,
      },
      handler: this.service.addUser.bind(this.service),
    })
  }

  @cached get createUser() {
    return this.utils.createCommand({
      method: 'createUser',
      auth: {
        mode: 'admin',
        abilities: ['users:create'],
      },
      schemas: {
        input: createUserRequestSchema,
        output: createUserResponseSchema,
      },
      handler: this.service.createUser.bind(this.service),
    })
  }

  @cached get updateUser() {
    return this.utils.createCommand({
      method: 'updateUser',
      auth: {
        mode: 'admin',
        abilities: ['users:edit'],
      },
      schemas: {
        input: updateUserRequestSchema,
        output: z.void(),
      },
      handler: this.service.updateUser.bind(this.service),
    })
  }

  @cached get deleteUser() {
    return this.utils.createCommand({
      method: 'deleteUser',
      auth: {
        mode: 'admin',
        abilities: ['users:delete'],
      },
      schemas: {
        input: deleteUserRequestSchema,
        output: z.void(),
      },
      handler: this.service.deleteUser.bind(this.service),
    })
  }
}

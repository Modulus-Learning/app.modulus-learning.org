import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  accountResponseSchema,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  setFullNameRequestSchema,
  verifyEmailRequestSchema,
} from './schemas.js'
import type { AdminAccountService } from './services/admin-account.js'

export class AdminAccountCommands {
  private utils: CoreUtils
  private service: AdminAccountService

  constructor(deps: { utils: CoreUtils; service: AdminAccountService }) {
    this.utils = deps.utils
    this.service = deps.service
  }

  @cached get getAccount() {
    return this.utils.createCommand({
      method: 'getAccount',
      auth: {
        mode: 'admin',
        abilities: ['account:read_own'],
      },
      schemas: {
        input: z.void(),
        output: accountResponseSchema,
      },
      handler: this.service.getAccount.bind(this.service),
    })
  }

  @cached get setFullName() {
    return this.utils.createCommand({
      method: 'setFullName',
      auth: {
        mode: 'admin',
        abilities: ['account:read_own', 'account:edit_own'],
      },
      schemas: {
        input: setFullNameRequestSchema,
        output: accountResponseSchema,
      },
      handler: this.service.setFullName.bind(this.service),
    })
  }

  @cached get changePassword() {
    return this.utils.createCommand({
      method: 'changePassword',
      auth: {
        mode: 'admin',
        abilities: ['account:read_own', 'account:edit_own'],
      },
      schemas: {
        input: changePasswordRequestSchema,
        output: accountResponseSchema,
      },
      handler: this.service.changePassword.bind(this.service),
    })
  }

  @cached get changeEmail() {
    return this.utils.createCommand({
      method: 'changeEmail',
      auth: {
        mode: 'admin',
        abilities: ['account:read_own', 'account:edit_own'],
      },
      schemas: {
        input: changeEmailRequestSchema,
        output: z.void(),
      },
      handler: this.service.changeEmail.bind(this.service),
    })
  }

  @cached get verifyEmail() {
    return this.utils.createCommand({
      method: 'verifyEmail',
      auth: {
        mode: 'admin',
        abilities: ['account:read_own', 'account:edit_own'],
      },
      schemas: {
        input: verifyEmailRequestSchema,
        output: accountResponseSchema,
      },
      handler: this.service.verifyEmail.bind(this.service),
    })
  }
}

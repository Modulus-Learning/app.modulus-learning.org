import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  accountResponseSchema,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  setFullNameRequestSchema,
  setPasswordRequestSchema,
  verifyEmailRequestSchema,
} from './schemas.js'
import type { AccountService } from './services/account.js'

export class AccountCommands {
  private utils: CoreUtils
  private accountService: AccountService

  constructor(deps: { utils: CoreUtils; service: AccountService }) {
    this.utils = deps.utils
    this.accountService = deps.service
  }

  @cached get getAccount() {
    return this.utils.createCommand({
      method: 'getAccount',
      auth: {
        mode: 'user',
        abilities: ['account:read_own'],
      },
      schemas: {
        input: z.void(),
        output: accountResponseSchema,
      },
      handler: this.accountService.getAccount.bind(this.accountService),
    })
  }

  @cached get setFullName() {
    return this.utils.createCommand({
      method: 'setFullName',
      auth: {
        mode: 'user',
        abilities: ['account:read_own', 'account:edit_own'],
      },
      schemas: {
        input: setFullNameRequestSchema,
        output: accountResponseSchema,
      },
      handler: this.accountService.setFullName.bind(this.accountService),
    })
  }

  @cached get setPassword() {
    return this.utils.createCommand({
      method: 'setPassword',
      auth: {
        mode: 'user',
        abilities: ['account:read_own', 'account:edit_own'],
      },
      schemas: {
        input: setPasswordRequestSchema,
        output: accountResponseSchema,
      },
      handler: this.accountService.setPassword.bind(this.accountService),
    })
  }

  @cached get changePassword() {
    return this.utils.createCommand({
      method: 'changePassword',
      auth: {
        mode: 'user',
        abilities: ['account:read_own', 'account:edit_own'],
      },
      schemas: {
        input: changePasswordRequestSchema,
        output: accountResponseSchema,
      },
      handler: this.accountService.changePassword.bind(this.accountService),
    })
  }

  @cached get changeEmail() {
    return this.utils.createCommand({
      method: 'changeEmail',
      auth: {
        mode: 'user',
        abilities: ['account:read_own', 'account:edit_own'],
      },
      schemas: {
        input: changeEmailRequestSchema,
        output: z.void(),
      },
      handler: this.accountService.changeEmail.bind(this.accountService),
    })
  }

  @cached get verifyEmail() {
    return this.utils.createCommand({
      method: 'verifyEmail',
      auth: {
        mode: 'user',
        abilities: ['account:read_own', 'account:edit_own'],
      },
      schemas: {
        input: verifyEmailRequestSchema,
        output: accountResponseSchema,
      },
      handler: this.accountService.verifyEmail.bind(this.accountService),
    })
  }
}

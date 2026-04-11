import crypto from 'node:crypto'

import argon2 from 'argon2'
import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import {
  ERR_FORBIDDEN,
  ERR_NOT_FOUND,
  ERR_UNAUTHORIZED,
  ERR_UNIQUE_CONSTRAINT,
  ERR_VERSION_CONFLICT,
} from '@/lib/errors.js'
import {
  ERR_CURRENT_PASSWORD,
  ERR_EMAIL_UNCHANGED,
  ERR_VERIFICATION_CODE_EXPIRED,
  ERR_VERIFICATION_CODE_INVALID,
} from '../errors.js'
import {
  type AccountResponse,
  type ChangeEmailRequest,
  type ChangePasswordRequest,
  type SetFullNameRequest,
  type SetPasswordRequest,
  toAccountResponse,
  type VerifyEmailRequest,
} from '../schemas.js'
import type { UserAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { Mailer } from '@/lib/email/services/mailer.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AccountMutations, AccountQueries } from '../repository/index.js'

export class AccountService extends BaseService {
  private tx: TXManager
  private mailer: Mailer
  private queries: AccountQueries
  private mutations: AccountMutations

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    mailer: Mailer
    queries: AccountQueries
    mutations: AccountMutations
  }) {
    super(deps.logger, 'app', 'account')
    this.tx = deps.tx
    this.mailer = deps.mailer
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async getAccount(userAuth: UserAuth): Promise<AccountResponse> {
    const account = await this.queries.getAccount(userAuth.id)
    if (account == null) {
      throw ERR_NOT_FOUND({
        message: 'Account not found',
      }).log(this.logger)
    }

    const roles = await this.queries.getRoles()

    return toAccountResponse(account, roles)
  }

  @method
  async setFullName(userAuth: UserAuth, request: SetFullNameRequest): Promise<AccountResponse> {
    if (request.id !== userAuth.id) {
      throw ERR_FORBIDDEN({
        message: "Cannot edit another user's account",
      }).log(this.logger)
    }

    await this.tx.withTransaction(async () => {
      const accountVersion = await this.mutations.getAccountVersionForUpdate(request.id)
      if (accountVersion == null) {
        throw ERR_NOT_FOUND({
          message: 'Account not found',
        }).log(this.logger)
      }

      if (accountVersion.vid !== request.vid) {
        throw ERR_VERSION_CONFLICT({
          message: 'Account data is stale - please refresh and try again',
        }).log(this.logger)
      }

      await this.mutations.updateAccount(request.id, {
        vid: request.vid + 1,
        updated_at: new Date(),
        full_name: request.full_name,
      })
    })

    return this.getAccount(userAuth)
  }

  @method
  async setPassword(userAuth: UserAuth, request: SetPasswordRequest): Promise<AccountResponse> {
    if (userAuth.id !== request.id) {
      throw ERR_FORBIDDEN({
        message: "Cannot edit another user's account",
      }).log(this.logger)
    }

    await this.tx.withTransaction(async () => {
      const accountPassword = await this.mutations.getAccountPasswordForUpdate(request.id)
      if (accountPassword == null) {
        throw ERR_NOT_FOUND({
          message: 'Account not found',
        }).log(this.logger)
      }

      if (accountPassword.vid !== request.vid) {
        throw ERR_VERSION_CONFLICT({
          message: 'Account data is stale - please refresh and try again',
        }).log(this.logger)
      }

      if (accountPassword.password != null) {
        throw ERR_CURRENT_PASSWORD({
          message: 'Account already has a password',
        }).log(this.logger)
      }

      // TODO: wrap error
      const hashedPassword = await argon2.hash(request.password)

      await this.mutations.updateAccount(request.id, {
        vid: request.vid + 1,
        updated_at: new Date(),
        password: hashedPassword,
      })
    })

    return this.getAccount(userAuth)
  }

  @method
  async changePassword(
    userAuth: UserAuth,
    request: ChangePasswordRequest
  ): Promise<AccountResponse> {
    if (request.id !== userAuth.id) {
      throw ERR_FORBIDDEN({
        message: "Cannot edit another user's account",
      }).log(this.logger)
    }

    await this.tx.withTransaction(async () => {
      const accountPassword = await this.mutations.getAccountPasswordForUpdate(request.id)
      if (accountPassword == null) {
        throw ERR_NOT_FOUND({
          message: 'Account not found',
        }).log(this.logger)
      }

      if (accountPassword.vid !== request.vid) {
        throw ERR_VERSION_CONFLICT({
          message: 'Account data is stale - please refresh and try again',
        }).log(this.logger)
      }

      if (accountPassword.password == null) {
        throw ERR_CURRENT_PASSWORD({
          message: 'Account does not have a password',
        }).log(this.logger)
      }

      const oldPasswordIsValid = await argon2.verify(accountPassword.password, request.old_password)
      if (!oldPasswordIsValid) {
        throw ERR_UNAUTHORIZED({
          message: 'Invalid credentials',
        }).log(this.logger)
      }

      // TODO: wrap error
      const hashedPassword = await argon2.hash(request.new_password)

      await this.mutations.updateAccount(request.id, {
        vid: request.vid + 1,
        updated_at: new Date(),
        password: hashedPassword,
      })
    })

    return this.getAccount(userAuth)
  }

  @method
  async changeEmail(userAuth: UserAuth, request: ChangeEmailRequest): Promise<void> {
    if (request.id !== userAuth.id) {
      throw ERR_FORBIDDEN({
        message: "Cannot edit another user's account",
      }).log(this.logger)
    }

    // Prune email change requests older than 24 hours
    // TODO: Move this to a job queue task
    const pruneDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await this.mutations.pruneEmailChangeRequests(pruneDate)

    // TODO: Does anything here need to be wrapped in a transaction?

    const accountVersion = await this.mutations.getAccountVersionForUpdate(request.id)
    if (accountVersion == null) {
      throw ERR_NOT_FOUND({
        message: 'Account not found',
      }).log(this.logger)
    }

    if (accountVersion.vid !== request.vid) {
      throw ERR_VERSION_CONFLICT({
        message: 'Account data is stale - please refresh and try again',
      }).log(this.logger)
    }

    const existingUserId = await this.queries.findUserIdByEmail(request.email)
    if (existingUserId === request.id) {
      throw ERR_EMAIL_UNCHANGED({
        message: 'This email address is already registered to this account',
      }).log(this.logger)
    }

    if (existingUserId != null) {
      throw ERR_UNIQUE_CONSTRAINT({
        message: 'This email address is already registered to another account',
      }).log(this.logger)
    }

    const verification_code = crypto.randomBytes(4).toString('hex').toUpperCase()

    await this.mutations.createEmailChangeRequest({
      id: uuidv7(),
      user_id: request.id,
      email: request.email,
      verification_code,
    })

    await this.mailer.sendTemplateEmail({
      to: request.email,
      subject: 'Modulus Email Verification Request',
      templateName: 'change-email-verification',
      templateData: { verification_code },
    })
  }

  @method
  async verifyEmail(userAuth: UserAuth, request: VerifyEmailRequest): Promise<AccountResponse> {
    if (request.id !== userAuth.id) {
      throw ERR_FORBIDDEN({
        message: "Cannot edit another user's account",
      }).log(this.logger)
    }

    await this.tx.withTransaction(async () => {
      const accountVersion = await this.mutations.getAccountVersionForUpdate(request.id)
      if (accountVersion == null) {
        throw ERR_NOT_FOUND({
          message: 'Account not found',
        }).log(this.logger)
      }

      // TODO: The request should include the expected account version id, and
      // we should check it here.

      const changeRequest = await this.queries.findEmailChangeRequest(
        request.id,
        request.verification_code
      )

      if (changeRequest == null) {
        throw ERR_VERIFICATION_CODE_INVALID({
          message: `Email verification code ${request.verification_code} not found`,
        }).log(this.logger)
      }

      const expirationWindow = 60 * 60 * 1000 // one hour
      if (Date.now() > changeRequest.created_at.getTime() + expirationWindow) {
        throw ERR_VERIFICATION_CODE_EXPIRED({
          message: 'Verification code expired',
        }).log(this.logger)
      }

      await this.mutations.updateAccount(request.id, {
        vid: accountVersion.vid + 1,
        updated_at: new Date(),
        email: changeRequest.email,
      })
    })

    return this.getAccount(userAuth)
  }
}

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
import { toAccountResponse } from '../utils.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { Mailer } from '@/lib/email/services/mailer.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AdminAccountMutations, AdminAccountQueries } from '../repository/index.js'
import type {
  AccountResponse,
  ChangeEmailRequest,
  ChangePasswordRequest,
  SetFullNameRequest,
  VerifyEmailRequest,
} from '../schemas.js'

export class AdminAccountService extends BaseService {
  private tx: TXManager
  private mailer: Mailer
  private queries: AdminAccountQueries
  private mutations: AdminAccountMutations

  constructor(deps: {
    logger: CoreLogger
    tx: TXManager
    mailer: Mailer
    queries: AdminAccountQueries
    mutations: AdminAccountMutations
  }) {
    super(deps.logger, 'admin', 'account')
    this.tx = deps.tx
    this.mailer = deps.mailer
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async getAccount(adminAuth: AdminAuth): Promise<AccountResponse> {
    const account = await this.queries.getAccount(adminAuth.admin_id)
    if (account == null) {
      throw ERR_NOT_FOUND({
        message: 'Account not found',
      }).log(this.logger)
    }

    const roles = await this.queries.getRoles()

    return toAccountResponse(account, roles)
  }

  @method
  async setFullName(adminAuth: AdminAuth, request: SetFullNameRequest): Promise<AccountResponse> {
    if (request.id !== adminAuth.admin_id) {
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
        given_name: request.given_name,
        family_name: request.family_name,
      })
    })

    return this.getAccount(adminAuth)
  }

  @method
  async changePassword(
    adminAuth: AdminAuth,
    request: ChangePasswordRequest
  ): Promise<AccountResponse> {
    if (request.id !== adminAuth.admin_id) {
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

      if (accountVersion.password == null) {
        throw ERR_CURRENT_PASSWORD({
          message: 'Account does not have a password',
        }).log(this.logger)
      }

      const oldPasswordIsValid = await argon2.verify(accountVersion.password, request.old_password)
      if (!oldPasswordIsValid) {
        throw ERR_UNAUTHORIZED({
          message: 'Invalid credentials',
        }).log(this.logger)
      }

      const hashedPassword = await argon2.hash(request.new_password)

      await this.mutations.updateAccount(request.id, {
        vid: request.vid + 1,
        updated_at: new Date(),
        password: hashedPassword,
      })
    })

    return this.getAccount(adminAuth)
  }

  @method
  async changeEmail(adminAuth: AdminAuth, request: ChangeEmailRequest): Promise<void> {
    if (request.id !== adminAuth.admin_id) {
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

    const existingUserId = await this.queries.findAdminUserIdByEmail(request.email)
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
      created_at: new Date(),
    })

    await this.mailer.sendTemplateEmail({
      to: request.email,
      subject: 'Modulus Email Verification Request',
      templateName: 'change-email-verification',
      templateData: { verification_code },
    })
  }

  @method
  async verifyEmail(adminAuth: AdminAuth, request: VerifyEmailRequest): Promise<AccountResponse> {
    if (request.id !== adminAuth.admin_id) {
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
          message: 'Email verification code not found',
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

    return this.getAccount(adminAuth)
  }
}

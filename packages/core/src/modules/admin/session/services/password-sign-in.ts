import argon2 from 'argon2'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_UNAUTHORIZED } from '@/lib/errors.js'
import { toSignInResult } from '../utils.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { AdminSessionMutations, AdminSessionQueries } from '../repository/index.js'
import type { AdminTokens, PasswordCredentials } from '../schemas.js'
import type { AdminTokenIssuer } from './token-issuer.js'

export class AdminPasswordSignInService extends BaseService {
  private queries: AdminSessionQueries
  private mutations: AdminSessionMutations
  private tokenIssuer: AdminTokenIssuer

  constructor(deps: {
    logger: CoreLogger
    queries: AdminSessionQueries
    mutations: AdminSessionMutations
    tokenIssuer: AdminTokenIssuer
  }) {
    super(deps.logger, 'admin', 'session')
    this.queries = deps.queries
    this.mutations = deps.mutations
    this.tokenIssuer = deps.tokenIssuer
  }

  @method
  async signInPassword(credentials: PasswordCredentials): Promise<AdminTokens> {
    const adminUser = await this.queries.findAdminUserByEmail(credentials.email)

    // TODO: Should admin logins be tracked in a 'admin_user_logins' table,
    // similar to the user_logins table?

    // TODO: Properly check for and record failed login attempts, and time
    // the user out or disable them based on those failures.

    // Handle non-existent admin user
    if (adminUser == null) {
      // TODO: Should we add a small delay here to mitigate timing attacks?

      this.logger.warn(
        {
          email: credentials.email,
          ip_address: credentials.ip_address,
        },
        'login attempt for non-existent admin user'
      )

      throw ERR_UNAUTHORIZED({
        message: 'invalid credentials',
        logLevel: 'silent',
      })
    }

    // Handle admin user with no stored password (TODO: is this even possible?)
    if (adminUser.password == null) {
      // TODO: Should we add a small delay here to mitigate timing attacks?

      this.logger.warn(
        {
          admin_user_id: adminUser.id,
          ip_address: credentials.ip_address,
        },
        'login attempt by an admin user without a stored password'
      )

      throw ERR_UNAUTHORIZED({
        message: 'invalid credentials',
        logLevel: 'silent',
      })
    }

    // Check password
    const passwordValid = await argon2
      .verify(adminUser.password, credentials.password)
      .catch((err) => {
        this.logger.error(
          {
            err,
            admin_user_id: adminUser.id,
          },
          'error verifying admin user password'
        )

        // TODO: Should this be ERR_UNAUTHORIZED, or some 'internal error' code?
        throw ERR_UNAUTHORIZED({
          message: 'invalid credentials',
          logLevel: 'silent',
        })
      })

    if (!passwordValid) {
      this.logger.warn(
        {
          admin_user_id: adminUser.id,
          ip_address: credentials.ip_address,
        },
        'admin login attempt with incorrect password'
      )

      await this.mutations.updateAdminUser(adminUser.id, {
        failed_login_attempts: adminUser.failed_login_attempts + 1,
      })

      throw ERR_UNAUTHORIZED({
        message: 'invalid credentials',
        logLevel: 'silent',
      })
    }

    if (!adminUser.is_enabled) {
      this.logger.warn(
        {
          admin_user_id: adminUser.id,
          ip_address: credentials.ip_address,
        },
        'login attempt by disabled admin user'
      )

      throw ERR_UNAUTHORIZED({
        message: 'invalid credentials',
        logLevel: 'silent',
      })
    }

    const updatedAdminUser = await this.mutations.updateAdminUser(adminUser.id, {
      // TODO: Should we update last_login_ip as well, or any other fields?  Reset failed
      // login attempts?
      last_login: new Date(),
      remember_me: credentials.remember_me,
    })

    this.logger.info(
      {
        admin_user_id: adminUser.id,
        ip_address: credentials.ip_address,
      },
      'admin user logged in successfully with password'
    )

    const adminAbilities = await this.queries.getAdminUserAbilities(adminUser.id)

    return this.tokenIssuer.createTokens(toSignInResult(updatedAdminUser, adminAbilities))
  }
}

import argon2 from 'argon2'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_UNAUTHORIZED } from '@/lib/errors.js'
import { toSignInResult } from '../utils.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { SessionMutations, SessionQueries } from '../repository/index.js'
import type { PasswordCredentials, UserTokens } from '../schemas.js'
import type { TokenIssuer } from './token-issuer.js'

export class PasswordSignInService extends BaseService {
  private tokenIssuer: TokenIssuer
  private queries: SessionQueries
  private mutations: SessionMutations

  constructor(deps: {
    logger: CoreLogger
    tokenIssuer: TokenIssuer
    queries: SessionQueries
    mutations: SessionMutations
  }) {
    super(deps.logger, 'app', 'session')
    this.tokenIssuer = deps.tokenIssuer
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async signInPassword(credentials: PasswordCredentials): Promise<UserTokens> {
    const user = await this.queries.findUserByEmail(credentials.email)

    // TODO: Properly check for and record failed login attempts, and time
    // the user out or disable them based on those failures.

    // Handle non-existent user
    if (user == null) {
      // TODO: Should we add a small delay here to mitigate timing attacks?

      this.logger.warn(
        {
          email: credentials.email,
          ip_address: credentials.ip_address,
        },
        'login attempt for non-existent user'
      )

      // TODO: Should we record this failure in the user_logins table?

      throw ERR_UNAUTHORIZED({
        message: 'invalid credentials',
        logLevel: 'silent',
      })
    }

    // Handle user with no stored password (i.e. an oauth or lti-only user)
    if (user.password == null) {
      // TODO: Should we add a small delay here to mitigate timing attacks?

      this.logger.warn(
        {
          user_id: user.id,
          ip_address: credentials.ip_address,
        },
        'login attempt by a user without a stored password'
      )

      await this.mutations.recordLogin({
        time: new Date(),
        user_id: user.id,
        provider: 'password',
        outcome: 'failed_no_password',
        ip_address: credentials.ip_address,
      })

      throw ERR_UNAUTHORIZED({
        message: 'invalid credentials',
        logLevel: 'silent',
      })
    }

    // Check user password
    const passwordValid = await argon2.verify(user.password, credentials.password).catch((err) => {
      this.logger.error(
        {
          err,
          user_id: user.id,
        },
        'error verifying user password'
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
          user_id: user.id,
          ip_address: credentials.ip_address,
        },
        'login attempt with incorrect password'
      )

      await this.mutations.updateUser(user, {
        failed_login_attempts: user.failed_login_attempts + 1,
      })

      await this.mutations.recordLogin({
        time: new Date(),
        user_id: user.id,
        provider: 'password',
        outcome: 'failed_bad_password',
        ip_address: credentials.ip_address,
      })

      throw ERR_UNAUTHORIZED({
        message: 'invalid credentials',
        logLevel: 'silent',
      })
    }

    if (!user.is_enabled) {
      this.logger.warn(
        {
          user_id: user.id,
          ip_address: credentials.ip_address,
        },
        'login attempt by disabled user'
      )

      await this.mutations.recordLogin({
        time: new Date(),
        user_id: user.id,
        provider: 'password',
        outcome: 'failed_disabled',
        ip_address: credentials.ip_address,
      })

      throw ERR_UNAUTHORIZED({
        message: 'account disabled',
        logLevel: 'silent',
      })
    }

    const updatedUser = await this.mutations.updateUser(user, {
      // TODO: Should we update last_login_ip as well, or any other fields?  Reset failed
      // login attempts?
      last_login: new Date(),
      last_provider: 'password',
      remember_me: credentials.remember_me,
    })

    this.logger.info(
      {
        user_id: user.id,
        ip_address: credentials.ip_address,
      },
      'user logged in successfully with password'
    )

    await this.mutations.recordLogin({
      time: new Date(),
      user_id: user.id,
      provider: 'password',
      outcome: 'success',
      ip_address: credentials.ip_address,
    })

    const abilities = await this.queries.getUserAbilities(user.id)

    return this.tokenIssuer.createTokens(toSignInResult(updatedUser, abilities))
  }
}

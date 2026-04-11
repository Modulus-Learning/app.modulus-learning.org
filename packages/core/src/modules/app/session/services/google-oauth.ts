import { google } from 'googleapis'
import { v7 as uuidv7 } from 'uuid'

import { BaseService } from '@/lib/base-service.js'
import { ERR_NOT_FOUND, ERR_UNAUTHORIZED } from '@/lib/errors.js'
import {
  ERR_ACCOUNT_NOT_LINKED,
  ERR_NO_OTHER_SIGN_IN,
  ERR_OTHER_LINKED_ACCOUNT,
} from '../errors.js'
import { toSignInResult } from '../utils.js'
import type { Config } from '@/config.js'
import type { UserAuth } from '@/lib/auth.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { SessionMutations, SessionQueries } from '../repository/index.js'
import type { GoogleOAuthCredentials, GoogleTokens, UserTokens } from '../schemas.js'
import type { TokenIssuer } from './token-issuer.js'

interface GoogleUserInfo {
  id: string
  email: string
  name: string
  given_name: string
  family_name: string
}

export class GoogleSignInService extends BaseService {
  private config: Config
  private tokenIssuer: TokenIssuer
  private queries: SessionQueries
  private mutations: SessionMutations

  constructor(deps: {
    logger: CoreLogger
    config: Config
    tokenIssuer: TokenIssuer
    queries: SessionQueries
    mutations: SessionMutations
  }) {
    super(deps.logger, 'app', 'session')
    this.config = deps.config
    this.tokenIssuer = deps.tokenIssuer
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  // Sign a user in using Google OAuth credentials.
  async signInGoogle(credentials: GoogleOAuthCredentials): Promise<UserTokens> {
    const googleUserInfo = await this.getGoogleUserInfo(credentials.tokens)

    // Fetch all modulus users linked to this google user id.
    const linkedUsers = await this.queries.findUsersByGoogleId(googleUserInfo.id)

    // Assertion.  There should never be more than one linked account.
    if (linkedUsers.length > 1) {
      this.logger.error(
        {
          user_ids: linkedUsers.map((u) => u.id),
        },
        'multiple users with same google id'
      )

      throw ERR_OTHER_LINKED_ACCOUNT({
        message: 'found multiple users with google id',
        logLevel: 'silent',
      })
    }

    // If linkedUsers was non-empty, its first entry must be the user to log in.
    let user = linkedUsers[0]

    // If credentials includes the field 'user_id', we interpret that as the id
    // of a pre-existing modulus user who we must log in.
    if (credentials.user_id != null) {
      // If we found a linked user but their id doesn't match, throw an error.
      if (user != null && credentials.user_id !== user.id) {
        this.logger.warn(
          {
            requested_user_id: credentials.user_id,
            linked_user_id: user.id,
          },
          'google account is already linked to another user'
        )

        throw ERR_OTHER_LINKED_ACCOUNT({
          message: 'google account is already linked to another user',
          logLevel: 'silent',
        })
      }

      // If we didn't find a linked user, look the user up by id.
      if (user == null) {
        user = await this.queries.getUser(credentials.user_id)
        if (user == null) {
          this.logger.warn(
            {
              requested_user_id: credentials.user_id,
            },
            'user not found'
          )

          // TODO: Better error type?  Was ERR_NOT_FOUND in @modulus-learning/api.
          throw ERR_UNAUTHORIZED({
            message: 'user not found',
            logLevel: 'silent',
          })
        }
      }
    }

    // If we don't have a user yet, it means credentials.user_id was unspecified
    // and no linked users were found.  Before creating a new user, look for an
    // existing user whose email address matches the google account's email
    // address.
    if (user == null) {
      user = await this.queries.findUserByEmail(googleUserInfo.email)

      // TODO: Is this check appropriate?  Currently, the email address should
      // always be verified, but if not we probably ought to throw an error
      // here.
      if (user && !user.is_email_verified) {
        this.logger.warn({ user_id: user.id }, 'email address not verified')

        throw ERR_UNAUTHORIZED({
          message: 'email address not verified',
          logLevel: 'silent',
        })
      }
    }

    // Finally, just create a new Modulus user account.
    if (user == null) {
      user = await this.mutations.createUser({
        id: uuidv7(),
        full_name: googleUserInfo.name,
        google_id: googleUserInfo.id,
        email: googleUserInfo.email,
        remember_me: credentials.remember_me,
        is_enabled: true,
        is_email_verified: true,
        // TODO: Any other fields go here?
      })

      // TODO: Shouldn't this be a single query?
      const roleIds = await this.queries.findRoleIdsByMachineName(['everyone', 'learner'])
      await this.mutations.addUserToRoles(user.id, roleIds)

      this.logger.info({ user_id: user.id }, 'created new user')
    }

    // At this point, we are guaranteed to have a user to log in.  Now proceed with
    // standard sign-in logic.

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
        provider: 'google',
        outcome: 'failed_disabled',
        ip_address: credentials.ip_address,
      })

      // TODO: Better error / log message?
      throw ERR_UNAUTHORIZED({
        message: 'account disabled',
        logLevel: 'silent',
      })
    }

    const updatedUser = await this.mutations.updateUser(user, {
      // TODO: Should we update last_login_ip as well, or any other fields?  Reset failed
      // login attempts?
      last_login: new Date(),
      last_provider: 'google',
      google_id: googleUserInfo.id, // TODO: Should this come before the 'user-is-enabled' check above?
      remember_me: credentials.remember_me,
    })

    this.logger.info(
      {
        user_id: user.id,
        ip_address: credentials.ip_address,
      },
      'user logged in successfully with google'
    )

    await this.mutations.recordLogin({
      time: new Date(),
      user_id: user.id,
      provider: 'google',
      outcome: 'success',
      ip_address: credentials.ip_address,
    })

    const abilities = await this.queries.getUserAbilities(user.id)

    return this.tokenIssuer.createTokens(toSignInResult(updatedUser, abilities))
  }

  private async getGoogleUserInfo(tokens: GoogleTokens): Promise<GoogleUserInfo> {
    try {
      const config = this.config.oauth.google

      const oauth2Client = new google.auth.OAuth2({
        clientId: config.client_id,
        clientSecret: config.client_secret,
        redirectUri: config.return_url,
      })

      oauth2Client.setCredentials({ access_token: tokens.access_token })

      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })

      const userInfo = await oauth2.userinfo.get()

      // TODO: Get rid of the 'as string', and properly validate these fields,
      // all of which can be null according to googleapis.  Note: the original
      // implementation in @modulus-learning/api checked that 'email' was defined, but
      // not the other fields.
      return {
        id: userInfo.data.id as string,
        email: userInfo.data.email as string,
        name: userInfo.data.name as string,
        given_name: userInfo.data.given_name as string,
        family_name: userInfo.data.family_name as string,
      }
    } catch (err) {
      this.logger.error({ err }, 'failed to fetch google user info')

      // TODO: Proper error type, message, and metadata
      throw ERR_UNAUTHORIZED({
        message: 'failed to fetch google user info',
        cause: err,
        logLevel: 'silent',
      })
    }
  }

  // TODO: Move this to account module.
  async unlinkAccount(userAuth: UserAuth) {
    const user = await this.queries.getUser(userAuth.id)
    if (user == null) {
      throw ERR_NOT_FOUND({ message: 'user not found', logLevel: 'warn' }).log(this.logger)
    }

    if (user.google_id == null) {
      throw ERR_ACCOUNT_NOT_LINKED({ message: 'google account is not linked' }).log(this.logger)
    }

    if (
      user.github_id == null &&
      user.password == null &&
      (user.lti_sub == null || user.lti_iss == null)
    ) {
      throw ERR_NO_OTHER_SIGN_IN({
        message: 'cannot unlink google account -- no other sign-in methods available',
      }).log(this.logger)
    }

    await this.mutations.updateUser(user, {
      google_id: null,
    })
  }
}

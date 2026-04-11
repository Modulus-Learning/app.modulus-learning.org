import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
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
import type { GithubOAuthCredentials, GithubTokens, UserTokens } from '../schemas.js'
import type { TokenIssuer } from './token-issuer.js'

interface GithubUserInfo {
  id: number
  name: string
}

interface GithubUserEmail {
  email: string
  primary: boolean
  verified: boolean
  visibility: string | null
}

export class GithubSignInService extends BaseService {
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

  // Sign a user in using Github OAuth credentials.
  @method
  async signInGithub(credentials: GithubOAuthCredentials): Promise<UserTokens> {
    // Fetch basic user profile from github.
    const githubUserInfo = await this.getGithubUserInfo(credentials.tokens)

    // We'll only fetch this if needed -- see below.
    let githubPrimaryEmail: string | undefined

    // Fetch all modulus users linked to this github user id.
    const linkedUsers = await this.queries.findUsersByGithubId(githubUserInfo.id)

    // Assertion.  There should never be more than one linked account.
    if (linkedUsers.length > 1) {
      this.logger.error(
        {
          user_ids: linkedUsers.map((u) => u.id),
        },
        'multiple users with same github id'
      )

      throw ERR_OTHER_LINKED_ACCOUNT({
        message: 'found multiple users with github id',
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
          'github account is already linked to another user'
        )

        throw ERR_OTHER_LINKED_ACCOUNT({
          message: 'github account is already linked to another user',
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
      githubPrimaryEmail = await this.getGithubPrimaryEmail(credentials.tokens)

      // TODO: Should we consider other verified email addresses reported by
      // github (i.e. not only the primary one?)
      user = await this.queries.findUserByEmail(githubPrimaryEmail)

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
        full_name: githubUserInfo.name,
        github_id: githubUserInfo.id,
        email: githubPrimaryEmail,
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
        provider: 'github',
        outcome: 'failed_disabled',
        ip_address: credentials.ip_address,
      })

      throw ERR_UNAUTHORIZED({
        message: 'account disabled',
        logLevel: 'silent',
      })
    }

    // TODO: Re-implement monthly-active-user updates
    // await updateMau(...)

    const updatedUser = await this.mutations.updateUser(user, {
      // TODO: Should we update last_login_ip as well, or any other fields?  Reset failed
      // login attempts?
      last_login: new Date(),
      last_provider: 'github',
      github_id: githubUserInfo.id, // TODO: Should this come before the 'user-is-enabled' check above?
      remember_me: credentials.remember_me,
    })

    this.logger.info(
      {
        user_id: user.id,
        ip_address: credentials.ip_address,
      },
      'user logged in successfully with github'
    )

    await this.mutations.recordLogin({
      time: new Date(),
      user_id: user.id,
      provider: 'github',
      outcome: 'success',
      ip_address: credentials.ip_address,
    })

    const abilities = await this.queries.getUserAbilities(user.id)

    return this.tokenIssuer.createTokens(toSignInResult(updatedUser, abilities))
  }

  @method
  private async getGithubUserInfo(tokens: GithubTokens): Promise<GithubUserInfo> {
    try {
      const response = await fetch(this.config.oauth.github.user_url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      })

      if (response.ok) {
        // TODO: Check that the expected fields are present, rather than casting
        // with 'as'.
        const userInfo = (await response.json()) as GithubUserInfo
        return userInfo
      }

      this.logger.error(
        {
          http_status: response.status,
          // TODO: Is it safe/appropriate to add response.text?
        },
        'failed to fetch github user info'
      )

      throw ERR_UNAUTHORIZED({
        message: 'failed to fetch github user info',
        logLevel: 'silent',
      })
    } catch (err) {
      this.logger.error({ err }, 'failed to fetch github user info')

      throw ERR_UNAUTHORIZED({
        message: 'failed to fetch github user info',
        cause: err,
        logLevel: 'silent',
      })
    }
  }

  private async getGithubPrimaryEmail(tokens: GithubTokens): Promise<string> {
    try {
      const response = await fetch(`${this.config.oauth.github.user_url}/emails`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      })

      if (response.ok) {
        // TODO: check that this response has the expected shape
        const addresses = (await response.json()) as GithubUserEmail[]
        const primaryAddress = addresses.find((address) => address.primary && address.verified)
        if (primaryAddress != null) {
          return primaryAddress.email
        }

        this.logger.warn('github account has no primary email address')

        throw ERR_UNAUTHORIZED({
          message: 'github account has no primary email address',
          logLevel: 'silent',
        })
      }

      this.logger.error(
        {
          http_status: response.status,
        },
        'failed to fetch github primary email'
      )

      throw ERR_UNAUTHORIZED({
        message: 'failed to fetch github primary email',
        logLevel: 'silent',
      })
    } catch (err) {
      this.logger.error(
        {
          err,
        },
        'failed to fetch github primary email'
      )

      throw ERR_UNAUTHORIZED({
        message: 'failed to fetch github primary email',
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

    if (user.github_id == null) {
      throw ERR_ACCOUNT_NOT_LINKED({ message: 'github account is not linked' }).log(this.logger)
    }

    if (
      user.google_id == null &&
      user.password == null &&
      (user.lti_sub == null || user.lti_iss == null)
    ) {
      throw ERR_NO_OTHER_SIGN_IN({
        message: 'cannot unlink github account -- no other sign-in methods available',
      }).log(this.logger)
    }

    await this.mutations.updateUser(user, {
      github_id: null,
    })
  }
}

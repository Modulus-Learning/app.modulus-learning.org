import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { ERR_UNAUTHORIZED } from '@/lib/errors.js'
import { toSignInResult } from '../utils.js'
import type { CoreLogger } from '@/lib/logger.js'
import type {
  SessionMutations,
  SessionQueries,
  UserInsert,
  UserRecord,
} from '../repository/index.js'
import type { LtiCredentials, SignInResult } from '../schemas.js'

export class LtiSignInService extends BaseService {
  private queries: SessionQueries
  private mutations: SessionMutations

  constructor(deps: { logger: CoreLogger; queries: SessionQueries; mutations: SessionMutations }) {
    super(deps.logger, 'app', 'session')
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async signInLti(credentials: LtiCredentials, isInstructor: boolean): Promise<SignInResult> {
    // - If there's already a Modulus account matching credentials.iss and sub, we use
    //   that account to log the user in.
    // - Otherwise, if credentials.email is defined and there's already a Modulus account matching
    //   that email address, we use _that_ account.
    // - Finally, if neither of the cases above holds, we create a new Modulus account and use it.

    // If there's already a Modulus user matching credentials.iss and credentials.sub, log that
    // user in.
    let user = await this.queries.findUserByLtiId(credentials.iss, credentials.sub)

    // If there was no such user, and credentials.email is defined, look for a Modulus user matching
    // credentials.email and log them in instead, and set that user's lti_iss and lti_sub to match
    // the values in credentials.
    if (user == null && credentials.email != null) {
      user = await this.queries.findUserByEmail(credentials.email)
    }

    if (user == null) {
      const roles = isInstructor ? ['everyone', 'instructor'] : ['everyone', 'learner']
      user = await this.createLTIUser(credentials, roles)
      this.logger.info({ user_id: user.id }, 'created new user via lti')
    } else {
      if (!user.is_enabled) {
        this.logger.warn(
          {
            user_id: user.id,
          },
          'lti login attempt by disabled user'
        )

        await this.mutations.recordLogin({
          time: new Date(),
          user_id: user.id,
          provider: 'lti',
          outcome: 'failed_disabled',
          ip_address: credentials.ip_address,
        })

        throw ERR_UNAUTHORIZED({
          message: `lti login attempt by disabled user ${user.id}`,
          logLevel: 'silent',
        })
      }

      const userUpdate: Partial<UserInsert> = {
        last_login: new Date(),
        last_provider: 'lti',
      }
      // Set user email based on credentials.email if it's not already set.
      if (user.email == null && credentials.email != null) {
        userUpdate.email = credentials.email
      }
      // Update lti_iss and lti_sub if they don't already match
      if (user.lti_iss !== credentials.iss || user.lti_sub !== credentials.sub) {
        userUpdate.lti_iss = credentials.iss
        userUpdate.lti_sub = credentials.sub
      }
      user = await this.mutations.updateUser(user, userUpdate)

      // TODO: This doesn't need two queries, nor an unconditional write.
      if (isInstructor) {
        this.logger.info('adding instructor role to user', {
          user_id: user.id,
        })

        const roleIds = await this.queries.findRoleIdsByMachineName(['instructor'])
        await this.mutations.addUserToRoles(user.id, roleIds)
      }
    }

    this.logger.info(
      {
        user_id: user.id,
        ip_address: credentials.ip_address,
      },
      'user logged in successfully with lti'
    )

    await this.mutations.recordLogin({
      time: new Date(),
      user_id: user.id,
      provider: 'lti',
      outcome: 'success',
      ip_address: credentials.ip_address,
    })

    const abilities = await this.queries.getUserAbilities(user.id)

    return toSignInResult(user, abilities)
  }

  private async createLTIUser(credentials: LtiCredentials, roles: string[]): Promise<UserRecord> {
    const roleIds = await this.queries.findRoleIdsByMachineName(roles)

    const user = await this.mutations.createUser({
      id: uuidv7(),
      full_name: credentials.name,
      email: credentials.email,
      lti_iss: credentials.iss,
      lti_sub: credentials.sub,
      is_enabled: true,
      last_login: new Date(),
      last_provider: 'lti',
      // TODO: More fields?
    })

    await this.mutations.addUserToRoles(user.id, roleIds)

    return user
  }
}

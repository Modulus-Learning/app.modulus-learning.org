import crypto from 'node:crypto'

import argon2 from 'argon2'
import { v7 as uuidv7 } from 'uuid'

import { BaseService, method } from '@/lib/base-service.js'
import { toSignInResult } from '../../session/utils.js'
import {
  ERR_REGISTRATION_EMAIL_CONFICT,
  ERR_REGISTRATION_EMAIL_NOT_VERIFIED,
  ERR_REGISTRATION_NOT_FOUND,
  ERR_REGISTRATION_WRONG_CODE,
} from '../errors.js'
import type { Config } from '@/config.js'
import type { Mailer } from '@/lib/email/services/mailer.js'
import type { CoreLogger } from '@/lib/logger.js'
import type { TokenIssuer } from '../../session/services/token-issuer.js'
import type { RegistrationMutations, RegistrationQueries } from '../repository/index.js'
import type {
  PreRegistrationRequest,
  PreRegistrationResponse,
  RegistrationRequest,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '../schemas.js'

// TODO: Add transactions as appropriate
export class RegistrationService extends BaseService {
  private config: Config
  private mailer: Mailer
  private tokenIssuer: TokenIssuer
  private queries: RegistrationQueries
  private mutations: RegistrationMutations

  constructor(deps: {
    logger: CoreLogger
    config: Config
    mailer: Mailer
    session: { tokenIssuer: TokenIssuer }
    queries: RegistrationQueries
    mutations: RegistrationMutations
  }) {
    super(deps.logger, 'app', 'registration')
    this.config = deps.config
    this.mailer = deps.mailer
    this.tokenIssuer = deps.session.tokenIssuer
    this.queries = deps.queries
    this.mutations = deps.mutations
  }

  @method
  async preRegister({
    email,
    full_name,
    agreed_to_terms,
    gtoken,
  }: PreRegistrationRequest): Promise<PreRegistrationResponse> {
    // TODO: Move this to a scheduled job
    await this.mutations.pruneRegistrations()

    // Perform reCaptcha check if gtoken was included in the request and/or if
    // recaptcha is mandatory (in which case check will fail if gtoken was not
    // included)
    if (gtoken || this.config.recaptcha.mandatory) {
      // TODO: actually perform recaptcha check, and throw on failure.
    }

    const existingUser = await this.queries.findUserByEmail(email)
    if (existingUser != null) {
      throw ERR_REGISTRATION_EMAIL_CONFICT({
        message: 'Email address is already registered',
      }).log(this.logger)
    }

    const verification_code = crypto.randomBytes(4).toString('hex').toUpperCase()

    const registrationData = {
      id: uuidv7(),
      full_name,

      email,
      agreed_to_terms,
      verification_code,
      is_email_verified: false,
      ip: '0.0.0.0', // TODO: Does IP need to be stored in this table?  If so, where should it come from?
    }

    let registration = await this.queries.findRegistrationByEmail(email)
    if (registration == null) {
      registration = await this.mutations.createRegistration(registrationData)
    } else {
      registration = await this.mutations.updateRegistration(registration.id, {
        ...registrationData,
        attempts: registration.attempts + 1,
      })
    }

    await this.mailer.sendTemplateEmail({
      to: email,
      subject: 'Modulus Email Verification Request',
      templateName: 'registration-email-verification',
      templateData: { verification_code },
    })

    return { id: registration.id }
  }

  @method
  async verifyEmail({ id, verification_code }: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    const registration = await this.queries.getRegistration(id)

    if (registration == null) {
      throw ERR_REGISTRATION_NOT_FOUND({
        message: 'Pre-registration not found for id.',
      }).log(this.logger)
    }

    if (registration.verification_code !== verification_code.toUpperCase()) {
      throw ERR_REGISTRATION_WRONG_CODE({
        message: 'Email verification code does not match',
      }).log(this.logger)
    }

    await this.mutations.updateRegistration(id, { is_email_verified: true })

    return { id }
  }

  @method
  async register(request: RegistrationRequest) {
    const registration = await this.queries.getRegistration(request.id)

    if (registration == null) {
      throw ERR_REGISTRATION_NOT_FOUND({
        message: 'Pre-registration not found for id.',
      }).log(this.logger)
    }

    if (!registration.is_email_verified) {
      throw ERR_REGISTRATION_EMAIL_NOT_VERIFIED({
        message: 'Email has not been verified.',
      }).log(this.logger)
    }

    const existingUser = await this.queries.findUserByEmail(registration.email)

    if (existingUser != null) {
      throw ERR_REGISTRATION_EMAIL_CONFICT({
        message: 'Email address is in use.',
      }).log(this.logger)
    }

    // TODO: Wrap error
    const password = await argon2.hash(request.password)

    const roleIds = await this.queries.findRoleIdsByMachineName(['everyone', 'learner'])

    const user = await this.mutations.createUser({
      id: uuidv7(),
      full_name: registration.full_name,
      password,
      email: registration.email,
      agreed_to_terms: registration.agreed_to_terms,
      is_email_verified: true,
      is_enabled: true,
      last_login: new Date(),
      last_provider: 'password',
      remember_me: false, // TODO: Revisit -- should remember_me default to false here?
    })

    await this.mutations.addUserToRoles(user.id, roleIds)

    await this.mutations.deleteRegistration(registration.id)

    await this.mailer.sendTemplateEmail({
      to: registration.email,
      subject: 'Welcome to Modulus',
      templateName: 'welcome',
      templateData: { full_name: registration.full_name },
    })

    // TODO: This can be fire-and-forget
    await this.mutations.recordLogin({
      time: new Date(),
      user_id: user.id,
      provider: 'password',
      outcome: 'success',
      // TODO: ip address
    })

    const abilities = await this.queries.getUserAbilities(user.id)

    return this.tokenIssuer.createTokens(toSignInResult(user, abilities))
  }
}

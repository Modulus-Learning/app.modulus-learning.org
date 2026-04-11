import { type CoreUtils, cached } from '@/lib/utils.js'
import { userTokensSchema } from '../session/schemas.js'
import {
  preRegistrationRequestSchema,
  preRegistrationResponseSchema,
  registrationRequestSchema,
  verifyEmailRequestSchema,
  verifyEmailResponseSchema,
} from './schemas.js'
import type { RegistrationService } from './services/registration.js'

export class RegistrationCommands {
  private utils: CoreUtils
  private registrationService: RegistrationService

  constructor(deps: { utils: CoreUtils; service: RegistrationService }) {
    this.utils = deps.utils
    this.registrationService = deps.service
  }

  @cached get preRegister() {
    return this.utils.createCommand({
      method: 'preRegister',
      auth: { mode: 'none' },
      schemas: {
        input: preRegistrationRequestSchema,
        output: preRegistrationResponseSchema,
      },
      handler: this.registrationService.preRegister.bind(this.registrationService),
    })
  }

  @cached get verifyEmail() {
    return this.utils.createCommand({
      method: 'verifyEmail',
      auth: { mode: 'none' },
      schemas: {
        input: verifyEmailRequestSchema,
        output: verifyEmailResponseSchema,
      },
      handler: this.registrationService.verifyEmail.bind(this.registrationService),
    })
  }

  @cached get register() {
    return this.utils.createCommand({
      method: 'register',
      auth: { mode: 'none' },
      schemas: {
        input: registrationRequestSchema,
        output: userTokensSchema,
      },
      handler: this.registrationService.register.bind(this.registrationService),
    })
  }
}

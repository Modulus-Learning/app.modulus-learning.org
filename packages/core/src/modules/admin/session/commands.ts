import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  adminTokensSchema,
  passwordCredentialsSchema,
  tokenRefreshRequestSchema,
  tokenRefreshResponseSchema,
} from './schemas.js'
import type { AdminPasswordSignInService } from './services/password-sign-in.js'
import type { AdminTokenRefreshService } from './services/token-refresh.js'

export class AdminSessionCommands {
  private utils: CoreUtils
  private passwordSignInService: AdminPasswordSignInService
  private tokenRefreshService: AdminTokenRefreshService

  constructor(deps: {
    utils: CoreUtils
    passwordSignInService: AdminPasswordSignInService
    tokenRefreshService: AdminTokenRefreshService
  }) {
    this.utils = deps.utils
    this.passwordSignInService = deps.passwordSignInService
    this.tokenRefreshService = deps.tokenRefreshService
  }

  @cached get signInPassword() {
    return this.utils.createCommand({
      method: 'signInPassword',
      auth: { mode: 'none' },
      schemas: {
        input: passwordCredentialsSchema,
        output: adminTokensSchema,
      },
      handler: this.passwordSignInService.signInPassword.bind(this.passwordSignInService),
    })
  }

  @cached get refreshTokens() {
    return this.utils.createCommand({
      method: 'refreshTokens',
      auth: { mode: 'none' },
      schemas: {
        input: tokenRefreshRequestSchema,
        output: tokenRefreshResponseSchema,
      },
      handler: this.tokenRefreshService.refreshTokens.bind(this.tokenRefreshService),
    })
  }
}

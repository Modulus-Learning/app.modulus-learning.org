import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  githubOAuthCredentialsSchema,
  googleOAuthCredentialsSchema,
  passwordCredentialsSchema,
  tokenRefreshRequestSchema,
  tokenRefreshResponseSchema,
  userTokensSchema,
} from './schemas.js'
import type { GithubSignInService } from './services/github-oauth.js'
import type { GoogleSignInService } from './services/google-oauth.js'
import type { PasswordSignInService } from './services/password-sign-in.js'
import type { TokenRefreshService } from './services/token-refresh.js'

export class UserSessionCommands {
  private utils: CoreUtils
  private passwordSignInService: PasswordSignInService
  private googleSignInService: GoogleSignInService
  private githubSignInService: GithubSignInService
  private tokenRefreshService: TokenRefreshService

  constructor(deps: {
    utils: CoreUtils
    passwordSignInService: PasswordSignInService
    googleSignInService: GoogleSignInService
    githubSignInService: GithubSignInService
    tokenRefreshService: TokenRefreshService
  }) {
    this.utils = deps.utils
    this.passwordSignInService = deps.passwordSignInService
    this.googleSignInService = deps.googleSignInService
    this.githubSignInService = deps.githubSignInService
    this.tokenRefreshService = deps.tokenRefreshService
  }

  @cached get signInPassword() {
    return this.utils.createCommand({
      method: 'signInPassword',
      auth: { mode: 'none' },
      schemas: {
        input: passwordCredentialsSchema,
        output: userTokensSchema,
      },
      handler: this.passwordSignInService.signInPassword.bind(this.passwordSignInService),
    })
  }

  @cached get signInGoogle() {
    return this.utils.createCommand({
      method: 'signInGoogle',
      auth: { mode: 'none' },
      schemas: {
        input: googleOAuthCredentialsSchema,
        output: userTokensSchema,
      },
      handler: this.googleSignInService.signInGoogle.bind(this.googleSignInService),
    })
  }

  @cached get signInGithub() {
    return this.utils.createCommand({
      method: 'signInGithub',
      auth: { mode: 'none' },
      schemas: {
        input: githubOAuthCredentialsSchema,
        output: userTokensSchema,
      },
      handler: this.githubSignInService.signInGithub.bind(this.githubSignInService),
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

  // TODO: Move this to account module.
  @cached get unlinkGoogleAccount() {
    return this.utils.createCommand({
      method: 'unlinkGoogleAccount',
      auth: {
        mode: 'user',
        abilities: [], // TODO: should there be an ability for this?
      },
      schemas: {
        input: z.void(),
        output: z.void(),
      },
      handler: this.googleSignInService.unlinkAccount.bind(this.googleSignInService),
    })
  }

  // TODO: Move this to account module.
  @cached get unlinkGithubAccount() {
    return this.utils.createCommand({
      method: 'unlinkGithubAccount',
      auth: {
        mode: 'user',
        abilities: [], // TODO: should there be an ability for this?
      },
      schemas: {
        input: z.void(),
        output: z.void(),
      },
      handler: this.githubSignInService.unlinkAccount.bind(this.githubSignInService),
    })
  }
}

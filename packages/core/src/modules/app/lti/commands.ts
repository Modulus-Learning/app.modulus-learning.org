import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  deepLinkRequestSchema,
  deepLinkResponseSchema,
  initLoginRequestSchema,
  initLoginResponseSchema,
  launchRequestSchema,
  launchResponseSchema,
} from './schemas.js'
import type { LtiDeepLinkingService } from './services/deep-link.js'
import type { LtiKeyStore } from './services/keystore.js'
import type { LtiLaunchService } from './services/launch.js'
import type { LtiLoginService } from './services/login.js'

export class LtiCommands {
  private utils: CoreUtils
  private keyStore: LtiKeyStore
  private loginService: LtiLoginService
  private launchService: LtiLaunchService
  private deepLinkingService: LtiDeepLinkingService

  constructor(deps: {
    utils: CoreUtils
    ltiKeyStore: LtiKeyStore
    loginService: LtiLoginService
    launchService: LtiLaunchService
    deepLinkingService: LtiDeepLinkingService
  }) {
    this.utils = deps.utils
    this.keyStore = deps.ltiKeyStore
    this.loginService = deps.loginService
    this.launchService = deps.launchService
    this.deepLinkingService = deps.deepLinkingService
  }

  @cached get getJWKS() {
    return this.utils.createCommand({
      method: 'getJWKS',
      auth: { mode: 'none' },
      schemas: {
        input: z.void(),
        // TODO: Define an output schema?
        output: z.any(),
      },
      handler: async () => this.keyStore.getJWKS(),
    })
  }

  @cached get handleLogin() {
    return this.utils.createCommand({
      method: 'handleLogin',
      auth: { mode: 'none' },
      schemas: {
        input: initLoginRequestSchema,
        output: initLoginResponseSchema,
      },
      handler: this.loginService.handleLogin.bind(this.loginService),
    })
  }

  @cached get handleLaunch() {
    return this.utils.createCommand({
      method: 'handleLaunch',
      auth: { mode: 'none' },
      schemas: {
        input: launchRequestSchema,
        output: launchResponseSchema,
      },
      handler: this.launchService.handleLaunch.bind(this.launchService),
    })
  }

  // TODO: Should the deep linking flow require an authenticated user (and
  // use authMode: 'user' instead?)
  @cached get handleDeepLink() {
    return this.utils.createCommand({
      method: 'handleDeepLink',
      auth: { mode: 'none' },
      schemas: {
        input: deepLinkRequestSchema,
        output: deepLinkResponseSchema,
      },
      handler: this.deepLinkingService.handleDeepLink.bind(this.deepLinkingService),
    })
  }
}

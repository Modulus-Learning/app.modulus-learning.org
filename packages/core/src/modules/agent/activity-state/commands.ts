import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  getPageStateSchemas,
  getProgressSchemas,
  setPageStateSchemas,
  setProgressSchemas,
} from './schemas.js'
import type { TokenRefreshService } from '../auth/services/token-refresh.js'
import type { ActivityPageStateService } from './services/pagestate.js'
import type { ActivityProgressService } from './services/progress.js'

export class ActivityStateCommands {
  private utils: CoreUtils
  private progressService: ActivityProgressService
  private pageStateService: ActivityPageStateService
  private tokenRenewalService: TokenRefreshService

  constructor(deps: {
    utils: CoreUtils
    progressService: ActivityProgressService
    pageStateService: ActivityPageStateService
    auth: { tokenRefresh: TokenRefreshService }
  }) {
    this.utils = deps.utils
    this.progressService = deps.progressService
    this.pageStateService = deps.pageStateService
    this.tokenRenewalService = deps.auth.tokenRefresh
  }

  @cached get getProgress() {
    return this.utils.createCommand({
      method: 'getProgress',
      auth: { mode: 'agent' },
      schemas: getProgressSchemas,
      handler: async (auth) => {
        const new_token = await this.tokenRenewalService.refreshToken(auth)
        const response = await this.progressService.getProgress(auth)
        return { ...response, new_token }
      },
    })
  }

  @cached get setProgress() {
    return this.utils.createCommand({
      method: 'setProgress',
      auth: { mode: 'agent' },
      schemas: setProgressSchemas,
      handler: async (auth, request) => {
        const new_token = await this.tokenRenewalService.refreshToken(auth)
        const response = await this.progressService.setProgress(auth, request)
        return { ...response, new_token }
      },
    })
  }

  @cached get getPageState() {
    return this.utils.createCommand({
      method: 'getPageState',
      auth: { mode: 'agent' },
      schemas: getPageStateSchemas,
      handler: async (auth) => {
        const new_token = await this.tokenRenewalService.refreshToken(auth)
        const response = await this.pageStateService.getPageState(auth)
        return { ...response, new_token }
      },
    })
  }

  @cached get setPageState() {
    return this.utils.createCommand({
      method: 'setPageState',
      auth: { mode: 'agent' },
      schemas: setPageStateSchemas,
      handler: async (auth, request) => {
        const new_token = await this.tokenRenewalService.refreshToken(auth)
        await this.pageStateService.setPageState(auth, request)
        return { new_token }
      },
    })
  }
}

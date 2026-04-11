import { type CoreUtils, cached } from '@/lib/utils.js'
import { claimAuthCodeSchemas, createAuthCodeSchemas } from './schemas.js'
import type { AgentAuthService } from './services/agent-auth.js'

export class AgentAuthCommands {
  private utils: CoreUtils
  private service: AgentAuthService

  constructor(deps: { utils: CoreUtils; service: AgentAuthService }) {
    this.utils = deps.utils
    this.service = deps.service
  }

  @cached get createAuthCode() {
    return this.utils.createCommand({
      method: 'createAuthCode',
      auth: {
        mode: 'user',
        abilities: [], // TODO: Should there be an ability for this?
      },
      schemas: createAuthCodeSchemas,
      handler: this.service.createAuthCode.bind(this.service),
    })
  }

  @cached get claimAuthCode() {
    return this.utils.createCommand({
      method: 'claimAuthCode',
      auth: { mode: 'none' },
      schemas: claimAuthCodeSchemas,
      handler: this.service.claimAuthCode.bind(this.service),
    })
  }
}

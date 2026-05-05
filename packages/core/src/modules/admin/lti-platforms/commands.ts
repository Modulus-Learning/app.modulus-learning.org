import { z } from 'zod'

import { type CoreUtils, cached } from '@/lib/utils.js'
import {
  createLtiPlatformRequestSchema,
  generateCanvasConfigRequestSchema,
  generateCanvasConfigResponseSchema,
  ltiPlatformListResponseSchema,
  ltiPlatformResponseSchema,
} from './schemas.js'
import type { LtiPlatformsService } from './services/lti-platforms.js'

export class LtiPlatformsCommands {
  private utils: CoreUtils
  private service: LtiPlatformsService

  constructor(deps: { utils: CoreUtils; service: LtiPlatformsService }) {
    this.utils = deps.utils
    this.service = deps.service
  }

  @cached get listLtiPlatforms() {
    return this.utils.createCommand({
      method: 'listLtiPlatforms',
      auth: {
        mode: 'admin',
        abilities: ['lti-platforms:list'],
      },
      schemas: {
        input: z.void(),
        output: ltiPlatformListResponseSchema,
      },
      handler: this.service.listLtiPlatforms.bind(this.service),
    })
  }

  @cached get createLtiPlatform() {
    return this.utils.createCommand({
      method: 'createLtiPlatform',
      auth: {
        mode: 'admin',
        abilities: ['lti-platforms:create'],
      },
      schemas: {
        input: createLtiPlatformRequestSchema,
        output: ltiPlatformResponseSchema,
      },
      handler: this.service.createLtiPlatform.bind(this.service),
    })
  }

  @cached get getLtiPlatform() {
    return this.utils.createCommand({
      method: 'getLtiPlatform',
      auth: {
        mode: 'admin',
        abilities: ['lti-platforms:read'],
      },
      schemas: {
        input: z.object({ id: z.string() }),
        output: ltiPlatformResponseSchema,
      },
      handler: this.service.getLtiPlatform.bind(this.service),
    })
  }

  @cached get generateCanvasConfig() {
    return this.utils.createCommand({
      method: 'generateCanvasConfig',
      auth: {
        mode: 'admin',
        abilities: ['lti-platforms:create'],
      },
      schemas: {
        input: generateCanvasConfigRequestSchema,
        output: generateCanvasConfigResponseSchema,
      },
      handler: this.service.generateCanvasConfig.bind(this.service),
    })
  }
}

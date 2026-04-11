import { z } from 'zod'

import { CLAIM_MESSAGE_TYPE } from '@/modules/app/lti/constants.js'
import { deepLinkingRequestSchema } from './deep-linking-request.js'
import { resourceLinkLaunchRequestSchema } from './resource-link-launch-request.js'

export const platformMessageSchema = z.discriminatedUnion(CLAIM_MESSAGE_TYPE, [
  resourceLinkLaunchRequestSchema,
  deepLinkingRequestSchema,
])

export type PlatformMessage = z.infer<typeof platformMessageSchema>

import { z } from 'zod'

import { CLAIM_MESSAGE_TYPE, CLAIM_RESOURCE_LINK } from '@/modules/app/lti/constants.js'
import { baseMessageSchema } from './base-message.js'

export const resourceLinkLaunchRequestSchema = baseMessageSchema.extend({
  [CLAIM_MESSAGE_TYPE]: z.literal('LtiResourceLinkRequest'),
  [CLAIM_RESOURCE_LINK]: z.object({
    id: z.string(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  }),
})

export type ResourceLinkLaunchRequest = z.infer<typeof resourceLinkLaunchRequestSchema>

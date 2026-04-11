import { z } from 'zod'

import {
  CLAIM_DEEP_LINKING_CONTENT,
  CLAIM_DEEP_LINKING_DATA,
  CLAIM_DEEP_LINKING_ERRORLOG,
  CLAIM_DEEP_LINKING_ERRORMSG,
  CLAIM_DEEP_LINKING_LOG,
  CLAIM_DEEP_LINKING_MSG,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_MESSAGE_TYPE,
  CLAIM_VERSION,
} from '@/modules/app/lti/constants.js'

const imageUrlSchema = z.object({
  url: z.url(),
  width: z.number().int(),
  height: z.number().int(),
})

const resourceLinkSchema = z.object({
  type: z.literal('ltiResourceLink'),
  url: z.optional(z.url()),
  title: z.optional(z.string()),
  text: z.optional(z.string()),
  icon: z.optional(imageUrlSchema),
  thumbnail: z.optional(imageUrlSchema),
  window: z.optional(
    z.object({
      targetName: z.optional(z.string()),
      width: z.optional(z.number().int()),
      height: z.optional(z.number().int()),
      windowFeatures: z.optional(z.string()),
    })
  ),
  iframe: z.optional(
    z.object({
      width: z.number().int(),
      height: z.number().int(),
    })
  ),
  custom: z.optional(z.record(z.string(), z.string())),
  lineItem: z.optional(
    z.object({
      label: z.optional(z.string()),
      scoreMaximum: z.number(),
      resourceId: z.optional(z.string()),
      tag: z.optional(z.string()),
      gradesReleased: z.optional(z.boolean()),
    })
  ),
  available: z.optional(
    z.object({
      startDateTime: z.optional(z.iso.datetime()),
      endDateTime: z.optional(z.iso.datetime()),
    })
  ),
  submission: z.optional(
    z.object({
      startDateTime: z.optional(z.iso.datetime()),
      endDateTime: z.optional(z.iso.datetime()),
    })
  ),
})

// TODO: Other content item types if we need them.
const contentItemSchema = z.discriminatedUnion('type', [resourceLinkSchema])

export const deepLinkingResponseSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  // exp: z.number(),
  // iat: z.number(),
  nonce: z.string(),
  azp: z.string().optional(),

  [CLAIM_MESSAGE_TYPE]: z.literal('LtiDeepLinkingResponse'),
  [CLAIM_VERSION]: z.literal('1.3.0'),
  [CLAIM_DEPLOYMENT_ID]: z.string(),
  [CLAIM_DEEP_LINKING_DATA]: z.optional(z.any()),
  [CLAIM_DEEP_LINKING_CONTENT]: z.optional(z.array(contentItemSchema)),
  [CLAIM_DEEP_LINKING_MSG]: z.optional(z.string()),
  [CLAIM_DEEP_LINKING_LOG]: z.optional(z.string()),
  [CLAIM_DEEP_LINKING_ERRORMSG]: z.optional(z.string()),
  [CLAIM_DEEP_LINKING_ERRORLOG]: z.optional(z.string()),
})

export type DeepLinkingResponse = z.infer<typeof deepLinkingResponseSchema>
export type DeepLinkingContentItem = z.infer<typeof contentItemSchema>

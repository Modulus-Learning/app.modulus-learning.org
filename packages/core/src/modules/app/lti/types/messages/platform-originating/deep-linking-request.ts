import { z } from 'zod'

import { CLAIM_DEEP_LINKING_SETTINGS, CLAIM_MESSAGE_TYPE } from '@/modules/app/lti/constants.js'
import { baseMessageSchema } from './base-message.js'

// Same claims as a resource link launch request, except the
// CLAIM_MESSAGE_TYPE must be 'LtiDeepLinkingRequest', and
// CLAIM_DEEP_LINKING_SETTINGS must be present.
// https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-request-message
export const deepLinkingRequestSchema = baseMessageSchema.extend({
  [CLAIM_MESSAGE_TYPE]: z.literal('LtiDeepLinkingRequest'),
  [CLAIM_DEEP_LINKING_SETTINGS]: z.object({
    deep_link_return_url: z.string(),
    accept_types: z.array(z.string()),
    accept_presentation_document_targets: z.array(z.string()),
    accept_media_types: z.optional(z.union([z.string(), z.array(z.string())])),
    accept_multiple: z.boolean().prefault(false),
    // Don't add a default for accept_lineitem -- if not specified, we can't
    // assume either true or false:
    // https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-settings
    accept_lineitem: z.optional(z.boolean()),
    auto_create: z.boolean().prefault(false),
    title: z.optional(z.string()),
    text: z.optional(z.string()),
    data: z.optional(z.any()),
    // TODO: Any canvas specific entries?
  }),
})

export type DeepLinkingRequest = z.infer<typeof deepLinkingRequestSchema>

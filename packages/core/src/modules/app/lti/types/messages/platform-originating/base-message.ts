import { z } from 'zod'

import {
  CLAIM_AGS_ENDPOINT,
  CLAIM_CUSTOM,
  CLAIM_DEPLOYMENT_ID,
  CLAIM_ROLES,
  CLAIM_TARGET_LINK_URI,
  CLAIM_VERSION,
} from '@/modules/app/lti/constants.js'

export const baseMessageSchema = z.object({
  // Core claims
  // https://www.imsglobal.org/spec/security/v1p0/#id-token
  // TODO: sub is apparently optional in case of anonymous resource link request messages?
  // https://www.imsglobal.org/spec/lti/v1p3/#anonymous-launch-case
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string(),
  exp: z.number(),
  iat: z.number(),
  nonce: z.string(),
  azp: z.optional(z.string()),

  // Potentially lots of additional openid-style claims about the user.  For
  // some additional possibilities, see
  // https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
  given_name: z.optional(z.string()),
  family_name: z.optional(z.string()),
  name: z.optional(z.string()),
  email: z.optional(z.string()),
  locale: z.optional(z.string()),

  // LTI claims
  [CLAIM_VERSION]: z.literal('1.3.0'),
  [CLAIM_DEPLOYMENT_ID]: z.string(),
  [CLAIM_TARGET_LINK_URI]: z.string(),
  [CLAIM_ROLES]: z.array(z.string()),
  [CLAIM_AGS_ENDPOINT]: z.optional(
    z.object({
      lineitems: z.string().optional(),
      lineitem: z.string().optional(),
      scope: z.string().array(),
    })
  ),
  [CLAIM_CUSTOM]: z.record(z.string(), z.union([z.string(), z.boolean()]).nullable()).prefault({}),

  // TODO: Lots more go here, possibly including
  // https://purl.imsglobal.org/spec/lti/claim/lis
  // https://purl.imsglobal.org/spec/lti/claim/context
  // https://purl.imsglobal.org/spec/lti/claim/tool_platform
  // https://purl.imsglobal.org/spec/lti/claim/launch_presentation
  // https://purl.imsglobal.org/spec/lti/claim/custom
  // https://purl.imsglobal.org/spec/lti-bo/claim/basicoutcome
  // https://purl.imsglobal.org/spec/lti/claim/ext
  // https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice
  // And a few canvas-specific ones...
})

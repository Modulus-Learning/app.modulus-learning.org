import { z } from 'zod'

import { userTokensSchema } from '../session/schemas.js'

// ====================================================
//  Output schemas
// ====================================================

export const initLoginResponseSchema = z.strictObject({
  redirectUrl: z.url(),
  stateId: z.string(),
  stateValue: z.string(),
})

export type InitLoginResponse = z.infer<typeof initLoginResponseSchema>

export const launchResponseSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('start-activity'),
    activity_code: z.string(),
    activity_url: z.string(),
    tokens: userTokensSchema,
  }),
  z.strictObject({
    type: z.literal('deep-link'),
    launch_id: z.string(),
    tokens: userTokensSchema,
  }),
  z.strictObject({
    type: z.literal('view-dashboard'),
    tokens: userTokensSchema,
  }),
])

export type LaunchResponse = z.infer<typeof launchResponseSchema>

export const deepLinkResponseSchema = z.strictObject({
  jwt: z.string(),
  return_url: z.url(),
})

export type DeepLinkResponse = z.infer<typeof deepLinkResponseSchema>

// ====================================================
//  Input schemas
// ====================================================

/**
 * The data sent from platform to tool in an init login request.
 *
 * https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login
 * https://www.imsglobal.org/spec/lti/v1p3#additional-login-parameters
 */
export const initLoginRequestSchema = z.object({
  iss: z.string(),
  login_hint: z.string(),
  target_link_uri: z.string(),
  lti_message_hint: z.string().optional(),
  lti_deployment_id: z.string().optional(),
  client_id: z.string().optional(),
})

export type InitLoginRequest = z.infer<typeof initLoginRequestSchema>

export const launchRequestSchema = z.object({
  id_token: z.string(),
  issuer: z.string(),
})

export type LaunchRequest = z.infer<typeof launchRequestSchema>

export const deepLinkRequestSchema = z.strictObject({
  launch_id: z.string(),
  activity_code: z.string(),
  activity_url: z.url(),
})

export type DeepLinkRequest = z.infer<typeof deepLinkRequestSchema>

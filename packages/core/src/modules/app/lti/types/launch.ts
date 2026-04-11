import { z } from 'zod'

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

/**
 * The data used to construct the response to an init login request.  The actual
 * response is an HTTP redirect to the given redirect_url, with a Set-Cookie
 * header based on the given 'state' value.
 */
export interface AuthenticationRedirect {
  redirectUrl: string
  stateId: string
  stateValue: string
}

/**
 * The parameters sent from tool to platform in response to an init login
 * request. This data is bundled into the query string of the redirect_url of an
 * AuthRedirect.
 *
 * https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
 * https://www.imsglobal.org/spec/lti/v1p3#lti_message_hint-login-parameter
 */

export const authenticationRequestSchema = z.object({
  scope: z.literal('openid'),
  response_type: z.literal('id_token'),
  client_id: z.string(),
  redirect_uri: z.string(),
  login_hint: z.string(),
  state: z.string(),
  response_mode: z.literal('form_post'),
  nonce: z.string(),
  prompt: z.literal('none'),
  lti_message_hint: z.string().optional(),
})

export type AuthenticationRequest = z.infer<typeof authenticationRequestSchema>

/**
 * The response the platform sends back to the tool in response to an
 * AuthRedirect (on success)
 *
 * TODO: Canvas returns a few other values, including 'authenticity_token' and
 * 'lti_storage_target'.  Do we have a use for them?
 */
export const authenticationResponseSchema = z.object({
  id_token: z.string(),
  state: z.string(),
})

export type AuthenticationResponse = z.infer<typeof authenticationResponseSchema>

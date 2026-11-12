import type { RegistrationConfigInput, RegistrationEndpoints } from '@modulus-learning/lti'

/**
 * Canvas registration: the default Canvas endpoints for an issuer, and the
 * developer-key configuration an administrator pastes into Canvas.
 */

/**
 * The authorization host Instructure documents for each hosted-Canvas issuer.
 * Every institution on Instructure-hosted Canvas shares one of these issuers.
 */
const HOSTED_CANVAS_SSO: Record<string, string> = {
  'https://canvas.instructure.com': 'https://sso.canvaslms.com',
  'https://canvas.beta.instructure.com': 'https://sso.beta.canvaslms.com',
  'https://canvas.test.instructure.com': 'https://sso.test.canvaslms.com',
}

/**
 * Default endpoints for a Canvas registration with `issuer`. An administrator
 * confirms or overrides each one; core stores what they confirm.
 *
 * | Environment | Issuer                                | Authorization endpoint                                      |
 * |-------------|---------------------------------------|-------------------------------------------------------------|
 * | Production  | `https://canvas.instructure.com`      | `https://sso.canvaslms.com/api/lti/authorize_redirect`      |
 * | Beta        | `https://canvas.beta.instructure.com` | `https://sso.beta.canvaslms.com/api/lti/authorize_redirect` |
 * | Test        | `https://canvas.test.instructure.com` | `https://sso.test.canvaslms.com/api/lti/authorize_redirect` |
 *
 * Self-hosted Canvas sets the issuer to its own host, so every endpoint stays
 * relative to the issuer.
 *
 * The token endpoint, JWKS URI and authorization server (the token `aud`)
 * stay on the issuer host for hosted Canvas too, pending verification against
 * Canvas test. Instructure documents only the authorization host move.
 *
 * @see https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_launch_overview
 */
export const canvasRegistrationEndpoints = (issuer: string): RegistrationEndpoints => {
  const origin = new URL(issuer).origin
  return {
    authorization_endpoint: new URL(
      '/api/lti/authorize_redirect',
      HOSTED_CANVAS_SSO[origin] ?? issuer
    ).href,
    authorization_server: new URL('/login/oauth2/token', issuer).href,
    token_endpoint: new URL('/login/oauth2/token', issuer).href,
    jwks_uri: new URL('/api/lti/security/jwks', issuer).href,
  }
}

export const canvasRegistrationConfig = (input: RegistrationConfigInput): string => {
  const {
    title = 'Modulus',
    description = 'Open Educational Learning',
    tool_id = 'modulus',
    platform = 'canvas.instructure.com',
  } = input
  const baseUrl = new URL(input.baseUrl)

  const config = {
    title,
    description,
    target_link_uri: new URL('/routes/lti/launch', baseUrl).toString(),
    oidc_initiation_url: new URL('/routes/lti/login', baseUrl).toString(),
    public_jwk: input.publicJwk,
    custom_fields: {},
    scopes: [
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
      'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      // 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
      // 'https://canvas.instructure.com/lti/account_lookup/scope/show',
      // 'https://canvas.instructure.com/lti-ags/progress/scope/show',
      // 'https://canvas.instructure.com/lti/page_content/show',
    ],
    extensions: [
      {
        domain: input.host,
        tool_id,
        privacy_level: 'public',
        platform,
        settings: {
          placements: [
            {
              text: 'Create a Modulus Assignment',
              placement: 'assignment_selection',
              message_type: 'LtiDeepLinkingRequest',
              custom_fields: {
                context_id: '$Context.id',
                context_title: '$Context.title',
                canvas_course_id: '$Canvas.course.id',
                canvas_course_name: '$Canvas.course.name',
                modulus_launch_type: 'deep-link',
                modulus_deep_link_context: 'assignment',
                com_instructure_context_uuid: '$com.instructure.Context.uuid',
                com_instructure_context_label: '$com.instructure.contextLabel',
                com_instructure_assignment_lti_id: '$com.instructure.Assignment.lti.id',
              },
              target_link_uri: new URL('/lti/deep-link', baseUrl).toString(),
            },
            // {
            //   text: 'Link to a Modulus activity',
            //   placement: 'link_selection',
            //   message_type: 'LtiDeepLinkingRequest',
            //   custom_fields: {
            //     context_id: '$Context.id',
            //     context_title: '$Context.title',
            //     canvas_course_id: '$Canvas.course.id',
            //     canvas_course_name: '$Canvas.course.name',
            //     modulus_launch_type: 'deep-link',
            //     modulus_deep_link_context: 'standalone',
            //     com_instructure_context_label: '$com.instructure.contextLabel',
            //   },
            //   target_link_uri: new URL('/lti/deep-link', baseUrl).toString(),
            // },
            // {
            //   text: 'Link to a Modulus activity',
            //   placement: 'editor_button',
            //   message_type: 'LtiDeepLinkingRequest',
            //   custom_fields: {
            //     context_id: '$Context.id',
            //     context_title: '$Context.title',
            //     canvas_course_id: '$Canvas.course.id',
            //     canvas_course_name: '$Canvas.course.name',
            //     modulus_launch_type: 'deep-link',
            //     modulus_deep_link_context: 'standalone',
            //     com_instructure_context_label: '$com.instructure.contextLabel',
            //   },
            //   target_link_uri: new URL('/lti/deep-link', baseUrl).toString(),
            // },
            {
              text: 'Modulus Dashboard',
              placement: 'course_navigation',
              message_type: 'LtiResourceLinkRequest',
              windowTarget: '_blank',
              custom_fields: {
                modulus_launch_type: 'view-dashboard',
              },
              target_link_uri: new URL('/dashboard', baseUrl).toString(),
              required_permissions: 'manage_students',
            },
          ],
        },
      },
    ],
  }

  return JSON.stringify(config, null, 2)
}

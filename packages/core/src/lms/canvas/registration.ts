import type { RegistrationConfigInput, RegistrationEndpoints } from '@/lms/contract.js'

/**
 * Canvas registration: the standard Canvas endpoints for an issuer, and the
 * developer-key configuration an administrator pastes into Canvas.
 */

export const canvasRegistrationEndpoints = (issuer: string): RegistrationEndpoints => ({
  authorization_endpoint: new URL('/api/lti/authorize_redirect', issuer).href,
  authorization_server: new URL('/login/oauth2/token', issuer).href,
  token_endpoint: new URL('/login/oauth2/token', issuer).href,
  jwks_uri: new URL('/api/lti/security/jwks', issuer).href,
})

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

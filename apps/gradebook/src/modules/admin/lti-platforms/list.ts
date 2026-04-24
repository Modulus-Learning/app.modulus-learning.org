import type { Locale } from '@/i18n/i18n-config'
import type { LtiPlatformsResponse } from './@types'

export async function listLtiPlatforms(_locale: Locale): Promise<LtiPlatformsResponse> {
  return {
    platforms: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Canvas Test',
        issuer: 'https://canvas.test.instructure.com',
        client_id: '10000000000001',
        deployment_id: '1:abcdef0123456789',
        authorization_endpoint: 'https://canvas.test.instructure.com/api/lti/authorize_redirect',
        token_endpoint: 'https://canvas.test.instructure.com/login/oauth2/token',
        jwks_uri: 'https://canvas.test.instructure.com/api/lti/security/jwks',
        authorization_server: 'https://canvas.test.instructure.com',
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Moodle Sandbox',
        issuer: 'https://moodle.sandbox.example.org',
        client_id: 'moodle-client-abc123',
        deployment_id: '2:fedcba9876543210',
        authorization_endpoint: 'https://moodle.sandbox.example.org/mod/lti/auth.php',
        token_endpoint: 'https://moodle.sandbox.example.org/mod/lti/token.php',
        jwks_uri: 'https://moodle.sandbox.example.org/mod/lti/certs.php',
        authorization_server: 'https://moodle.sandbox.example.org',
      },
    ],
  }
}

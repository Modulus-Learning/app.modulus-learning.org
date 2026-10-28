/**
 * Characterisation of Canvas platform registration: the endpoints derived from
 * an issuer and the generated developer-key configuration. Both move to the
 * Canvas adapter in the extraction and must produce the same output.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canvasAdapter } from '@/lms/canvas/index.js'
import { LtiPlatformsService } from '@/modules/admin/lti-platforms/services/lti-platforms.js'
import { syntheticAdapter } from '@/test-support/lms.js'
import { silentLogger } from '@/test-support/lti.js'
import type { Config } from '@/config.js'
import type { AdminAuth } from '@/lib/auth.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { LmsAdapter } from '@/lms/contract.js'
import type {
  LtiPlatformMutations,
  LtiPlatformQueries,
} from '@/modules/admin/lti-platforms/repository.js'

const PUBLIC_JWK = {
  kty: 'RSA',
  n: 'modulus-n',
  e: 'AQAB',
  alg: 'RS256',
  use: 'sig',
  kid: 'tool-key',
}

const createService = (existingIssuer?: string, adapter: LmsAdapter = canvasAdapter()) => {
  const created: Record<string, unknown>[] = []
  const service = new LtiPlatformsService({
    lmsAdapter: adapter,
    logger: silentLogger(),
    config: {
      server: {
        baseUrl: 'https://modulus.characterisation.test',
        host: 'modulus.characterisation.test',
      },
    } as Config,
    ltiKeyStore: { getJWKS: () => ({ keys: [PUBLIC_JWK] }) } as unknown as LtiKeyStore,
    queries: {
      findPlatformByIssuer: async (issuer: string) =>
        issuer === existingIssuer ? { id: 'existing', issuer } : undefined,
    } as unknown as LtiPlatformQueries,
    mutations: {
      createPlatform: async (values: Record<string, unknown>) => {
        created.push(values)
        return values
      },
    } as unknown as LtiPlatformMutations,
  })
  return { service, created }
}

const auth = {} as AdminAuth

describe('LtiPlatformsService (Canvas registration)', () => {
  it('derives the Canvas endpoints from the issuer', async () => {
    const { service, created } = createService()
    await service.createLtiPlatform(auth, {
      name: 'Canvas',
      issuer: 'https://canvas.characterisation.test',
      client_id: '10000000000001',
    })
    const { id, ...values } = created[0] ?? {}
    assert.equal(typeof id, 'string')
    assert.deepEqual(values, {
      name: 'Canvas',
      issuer: 'https://canvas.characterisation.test',
      client_id: '10000000000001',
      authorization_endpoint: 'https://canvas.characterisation.test/api/lti/authorize_redirect',
      authorization_server: 'https://canvas.characterisation.test/login/oauth2/token',
      token_endpoint: 'https://canvas.characterisation.test/login/oauth2/token',
      jwks_uri: 'https://canvas.characterisation.test/api/lti/security/jwks',
    })
  })

  it('refuses a second platform with the same issuer', async () => {
    const { service, created } = createService('https://canvas.characterisation.test')
    await assert.rejects(
      service.createLtiPlatform(auth, {
        name: 'Canvas again',
        issuer: 'https://canvas.characterisation.test',
        client_id: '10000000000002',
      })
    )
    assert.deepEqual(created, [])
  })

  it('generates this developer-key configuration by default', async () => {
    const { service } = createService()
    const { config_json } = await service.generateCanvasConfig(auth, {})

    assert.deepEqual(JSON.parse(config_json), {
      title: 'Modulus',
      description: 'Open Educational Learning',
      target_link_uri: 'https://modulus.characterisation.test/routes/lti/launch',
      oidc_initiation_url: 'https://modulus.characterisation.test/routes/lti/login',
      public_jwk: PUBLIC_JWK,
      custom_fields: {},
      scopes: [
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
        'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
        'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      ],
      extensions: [
        {
          domain: 'modulus.characterisation.test',
          tool_id: 'modulus',
          privacy_level: 'public',
          platform: 'canvas.instructure.com',
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
                target_link_uri: 'https://modulus.characterisation.test/lti/deep-link',
              },
              {
                text: 'Modulus Dashboard',
                placement: 'course_navigation',
                message_type: 'LtiResourceLinkRequest',
                windowTarget: '_blank',
                custom_fields: { modulus_launch_type: 'view-dashboard' },
                target_link_uri: 'https://modulus.characterisation.test/dashboard',
                required_permissions: 'manage_students',
              },
            ],
          },
        },
      ],
    })
  })

  it('applies the requested title, description, tool id and platform', async () => {
    const { service } = createService()
    const config = JSON.parse(
      (
        await service.generateCanvasConfig(auth, {
          title: 'Coursework',
          description: 'Interactive activities',
          tool_id: 'coursework',
          platform: 'canvas.example.edu',
        })
      ).config_json
    )
    assert.equal(config.title, 'Coursework')
    assert.equal(config.description, 'Interactive activities')
    assert.equal(config.extensions[0].tool_id, 'coursework')
    assert.equal(config.extensions[0].platform, 'canvas.example.edu')
  })
})

describe('LtiPlatformsService with a non-Canvas adapter', () => {
  it('derives endpoints from the adapter, not Canvas paths', async () => {
    const { service, created } = createService(undefined, syntheticAdapter())
    await service.createLtiPlatform(auth, {
      name: 'Synthetic',
      issuer: 'https://lms.synthetic.test',
      client_id: 'synthetic-client',
    })
    assert.equal(created[0]?.authorization_endpoint, 'https://lms.synthetic.test/oidc/authorize')
    assert.equal(created[0]?.jwks_uri, 'https://lms.synthetic.test/oidc/jwks')
  })

  it('refuses to generate a registration configuration the adapter cannot produce', async () => {
    const { service } = createService(undefined, syntheticAdapter())
    await assert.rejects(service.generateCanvasConfig(auth, {}), /does not generate registration/)
  })
})

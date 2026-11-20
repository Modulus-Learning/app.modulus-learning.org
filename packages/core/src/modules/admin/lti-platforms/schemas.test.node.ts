/**
 * Server-side validation of LTI platform registrations, and the abilities and
 * input stripping the commands apply before the service sees a request.
 */
import assert from 'node:assert/strict'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'
import { describe, it } from 'vitest'

import { AdminAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CoreUtils } from '@/lib/utils.js'
import { LtiPlatformsCommands } from './commands.js'
import {
  audienceSchema,
  createLtiPlatformRequestSchema,
  endpointUrlSchema,
  issuerSchema,
  updateLtiPlatformRequestSchema,
} from './schemas.js'
import type { LtiPlatformsService } from './services/lti-platforms.js'

const VALID_CREATE = {
  name: 'Canvas',
  issuer: 'https://canvas.instructure.com',
  client_id: '10000000000001',
}

const EDITED = {
  id: '01900000-0000-7000-8000-000000000001',
  name: 'Canvas',
  client_id: '10000000000001',
  authorization_endpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
  token_endpoint: 'https://sso.canvaslms.com/login/oauth2/token',
  jwks_uri: 'https://sso.canvaslms.com/api/lti/security/jwks',
  authorization_server: 'sso.canvaslms.com',
}

const rejects = (result: { success: boolean }) => assert.equal(result.success, false)

describe('issuerSchema', () => {
  it('accepts an https issuer and trims it', () => {
    assert.equal(
      issuerSchema.parse('  https://canvas.instructure.com  '),
      'https://canvas.instructure.com'
    )
    assert.equal(issuerSchema.parse('https://lms.example.edu/lti'), 'https://lms.example.edu/lti')
  })

  it('rejects an http issuer', () => {
    rejects(issuerSchema.safeParse('http://canvas.instructure.com'))
  })

  it('rejects a query or fragment, including an empty one', () => {
    rejects(issuerSchema.safeParse('https://canvas.instructure.com?tenant=1'))
    rejects(issuerSchema.safeParse('https://canvas.instructure.com#top'))
    rejects(issuerSchema.safeParse('https://canvas.instructure.com?'))
    rejects(issuerSchema.safeParse('https://canvas.instructure.com#'))
  })

  it('rejects a trailing slash, with a message the host can show', () => {
    for (const issuer of ['https://canvas.instructure.com/', 'https://lms.example.edu/lti/']) {
      const result = issuerSchema.safeParse(issuer)
      assert.equal(result.success, false)
      assert.equal(
        result.error?.issues[0]?.message,
        "Remove the trailing slash; the platform's iss claim has none."
      )
    }
  })

  it('rejects an issuer over 255 characters', () => {
    rejects(issuerSchema.safeParse(`https://lms.example.edu/${'a'.repeat(240)}`))
  })

  it('rejects a value that is not a URL', () => {
    rejects(issuerSchema.safeParse('canvas.instructure.com'))
    rejects(issuerSchema.safeParse(''))
  })
})

describe('endpointUrlSchema', () => {
  it('accepts a query', () => {
    assert.equal(
      endpointUrlSchema.parse('https://lms.example.edu/jwks?registration=1'),
      'https://lms.example.edu/jwks?registration=1'
    )
  })

  it('rejects a fragment', () => {
    rejects(endpointUrlSchema.safeParse('https://lms.example.edu/jwks#keys'))
    rejects(endpointUrlSchema.safeParse('https://lms.example.edu/jwks#'))
  })

  it('rejects http and values over 2048 characters', () => {
    rejects(endpointUrlSchema.safeParse('http://lms.example.edu/token'))
    rejects(endpointUrlSchema.safeParse(`https://lms.example.edu/${'a'.repeat(2048)}`))
  })
})

describe('audienceSchema', () => {
  it('accepts a bare host name', () => {
    assert.equal(audienceSchema.parse('sso.canvaslms.com'), 'sso.canvaslms.com')
  })

  it('rejects an empty or blank value', () => {
    rejects(audienceSchema.safeParse(''))
    rejects(audienceSchema.safeParse('   '))
  })
})

describe('createLtiPlatformRequestSchema', () => {
  it('keeps the endpoints optional', () => {
    assert.deepEqual(createLtiPlatformRequestSchema.parse(VALID_CREATE), VALID_CREATE)
  })

  it('rejects an invalid issuer or an http endpoint', () => {
    rejects(
      createLtiPlatformRequestSchema.safeParse({
        ...VALID_CREATE,
        issuer: 'http://canvas.instructure.com',
      })
    )
    rejects(
      createLtiPlatformRequestSchema.safeParse({
        ...VALID_CREATE,
        issuer: 'https://canvas.instructure.com/',
      })
    )
    rejects(
      createLtiPlatformRequestSchema.safeParse({
        ...VALID_CREATE,
        token_endpoint: 'http://canvas.instructure.com/login/oauth2/token',
      })
    )
  })
})

describe('updateLtiPlatformRequestSchema', () => {
  it('requires every endpoint', () => {
    const { jwks_uri: _jwks, ...missing } = EDITED
    rejects(updateLtiPlatformRequestSchema.safeParse(missing))
  })

  it('strips an issuer sent by a client', () => {
    const parsed = updateLtiPlatformRequestSchema.parse({
      ...EDITED,
      issuer: 'https://elsewhere.test',
    })
    assert.equal('issuer' in parsed, false)
  })
})

/** Commands over a service stub that records what reaches it. */
const makeCommands = () => {
  const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })
  const calls: { method: string; request: unknown }[] = []
  const service = {
    updateLtiPlatform: async (_auth: AdminAuth, request: typeof EDITED) => {
      calls.push({ method: 'updateLtiPlatform', request })
      return { platform: { ...request, issuer: 'https://canvas.instructure.com' } }
    },
    suggestLtiPlatformEndpoints: async (_auth: AdminAuth, request: { issuer: string }) => {
      calls.push({ method: 'suggestLtiPlatformEndpoints', request })
      return {
        authorization_endpoint: `${request.issuer}/authorize`,
        token_endpoint: `${request.issuer}/token`,
        jwks_uri: `${request.issuer}/jwks`,
        authorization_server: `${request.issuer}/token`,
      }
    },
  } as unknown as LtiPlatformsService
  return {
    commands: new LtiPlatformsCommands({ utils: new CoreUtils({ logger }), service }),
    calls,
  }
}

const ctx = (abilities: string[]) => ({
  requestId: uuidv7(),
  adminAuth: new AdminAuth(uuidv7(), abilities),
})

describe('LtiPlatformsCommands', () => {
  it('refuses updateLtiPlatform without lti-platforms:edit', async () => {
    const { commands, calls } = makeCommands()
    const result = await commands.updateLtiPlatform(
      ctx(['lti-platforms:read', 'lti-platforms:create']),
      EDITED
    )
    assert.equal(result.ok, false)
    assert.equal(result.ok ? undefined : result.error.code, 'ERR_FORBIDDEN')
    assert.deepEqual(calls, [])
  })

  it('passes updateLtiPlatform to the service without an issuer', async () => {
    const { commands, calls } = makeCommands()
    const result = await commands.updateLtiPlatform(ctx(['lti-platforms:edit']), {
      ...EDITED,
      issuer: 'https://elsewhere.test',
    } as typeof EDITED)
    assert.equal(result.ok, true)
    assert.deepEqual(calls, [{ method: 'updateLtiPlatform', request: EDITED }])
  })

  it('suggests endpoints to an admin session without any ability', async () => {
    const { commands } = makeCommands()
    for (const abilities of [[], ['lti-platforms:edit'], ['lti-platforms:create']]) {
      const result = await commands.suggestLtiPlatformEndpoints(ctx(abilities), {
        issuer: 'https://canvas.instructure.com',
      })
      assert.equal(result.ok, true)
    }
  })

  it('validates the issuer before suggesting endpoints', async () => {
    const { commands, calls } = makeCommands()
    const result = await commands.suggestLtiPlatformEndpoints(ctx([]), {
      issuer: 'https://canvas.instructure.com/',
    })
    assert.equal(result.ok, false)
    assert.deepEqual(calls, [])

    const ok = await commands.suggestLtiPlatformEndpoints(ctx([]), {
      issuer: 'https://canvas.instructure.com',
    })
    assert.equal(ok.ok, true)
  })
})

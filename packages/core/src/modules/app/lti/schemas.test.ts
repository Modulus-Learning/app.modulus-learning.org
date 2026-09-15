import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { UserAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CoreUtils } from '@/lib/utils.js'
import { INSTRUCTOR_ACTIVITY_URL_MESSAGES } from '../activities/schemas.js'
import { LtiCommands } from './commands.js'
import { type DeepLinkRequest, deepLinkRequestSchema } from './schemas.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { LtiDeepLinkingService } from './services/deep-link.js'
import type { LtiLaunchService } from './services/launch.js'
import type { LtiLoginService } from './services/login.js'

const ORIGIN = 'https://content.test'

const request = (activity_url: string) => ({
  launch_id: 'launch-1',
  activity_code_id: uuidv7(),
  activity_url,
})

describe('deepLinkRequestSchema activity_url', () => {
  for (const activity_url of [
    'HTTPS://CONTENT.TEST:443/lesson',
    `${ORIGIN}/unit/../lesson`,
    `${ORIGIN}/what%3F`,
    `${ORIGIN}/%23top`,
  ]) {
    it(`accepts ${activity_url} and retains its spelling`, () => {
      const result = deepLinkRequestSchema.safeParse(request(activity_url))

      assert.equal(result.success, true)
      assert.equal(result.data?.activity_url, activity_url)
    })
  }

  for (const activity_url of [
    `${ORIGIN}/lesson?exercise=1`,
    `${ORIGIN}/lesson#part-2`,
    `${ORIGIN}/lesson?`,
    `${ORIGIN}/lesson#`,
  ]) {
    it(`rejects ${activity_url} with the component warning`, () => {
      const result = deepLinkRequestSchema.safeParse(request(activity_url))

      assert.equal(result.success, false)
      assert.deepEqual(
        result.error?.issues.map(({ path, message }) => ({ path, message })),
        [
          {
            path: ['activity_url'],
            message: INSTRUCTOR_ACTIVITY_URL_MESSAGES.unsupported_url_components,
          },
        ]
      )
    })
  }

  it('rejects an unparseable url', () => {
    const result = deepLinkRequestSchema.safeParse(request('content.test/lesson'))

    assert.equal(result.success, false)
    assert.deepEqual(
      result.error?.issues.map(({ path, message }) => ({ path, message })),
      [{ path: ['activity_url'], message: INSTRUCTOR_ACTIVITY_URL_MESSAGES.malformed_url }]
    )
  })
})

describe('LtiCommands.handleDeepLink validation', () => {
  const makeCommands = () => {
    const handlerInputs: DeepLinkRequest[] = []
    const deepLinkingService = {
      handleDeepLink: async (_auth: UserAuth, input: DeepLinkRequest) => {
        handlerInputs.push(input)
        return { jwt: 'signed', return_url: 'https://lms.test/return' }
      },
    } as unknown as LtiDeepLinkingService

    const commands = new LtiCommands({
      utils: new CoreUtils({ logger: createCoreLogger({ pinoLogger: pino({ level: 'silent' }) }) }),
      ltiKeyStore: {} as LtiKeyStore,
      loginService: {} as LtiLoginService,
      launchService: {} as LtiLaunchService,
      deepLinkingService,
    })

    const ctx = {
      requestId: 'request-1',
      userAuth: new UserAuth(uuidv7(), ['activity_codes:update_own']),
    }
    return { commands, ctx, handlerInputs }
  }

  for (const suffix of ['?exercise=1', '#part-2', '?', '#']) {
    it(`returns ERR_VALIDATION for ${suffix} before the handler runs`, async () => {
      const { commands, ctx, handlerInputs } = makeCommands()

      const result = await commands.handleDeepLink(ctx, request(`${ORIGIN}/lesson${suffix}`))

      assert.equal(result.ok, false)
      assert.equal(result.ok === false && result.error.code, 'ERR_VALIDATION')
      assert.deepEqual(handlerInputs, [])
    })
  }

  it('hands the handler the submitted spelling', async () => {
    const { commands, ctx, handlerInputs } = makeCommands()

    const result = await commands.handleDeepLink(ctx, request('HTTPS://CONTENT.TEST:443/lesson'))

    assert.equal(result.ok, true)
    assert.equal(handlerInputs[0]?.activity_url, 'HTTPS://CONTENT.TEST:443/lesson')
  })
})

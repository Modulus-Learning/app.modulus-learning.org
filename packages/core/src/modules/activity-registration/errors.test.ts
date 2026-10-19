import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'

import { AdminAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CoreUtils } from '@/lib/utils.js'
import { activityUrlNotAllowed, ErrorCodes } from './errors.js'
import type { RejectedRegistration } from './schemas.js'

const DENIED = 'https://elsewhere.test/page?token=secret-token-value#fragment-value'

/** A logger whose every level is captured as a raw JSON line. */
const makeCapturingUtils = () => {
  const lines: string[] = []
  const logger = createCoreLogger({
    pinoLogger: pino(
      { level: 'trace' },
      {
        write: (chunk: string) => {
          lines.push(chunk)
        },
      }
    ),
  })

  return { logger, utils: new CoreUtils({ logger }), lines }
}

describe('activityUrlNotAllowed', () => {
  it('carries the full urls in details, for the host to report', () => {
    const rejected: RejectedRegistration[] = [
      { url: DENIED, reason: 'activity_url_not_allowed' },
      { url: 'https://elsewhere.test/other', reason: 'url_too_long' },
    ]

    const error = activityUrlNotAllowed(rejected)

    assert.equal(error.code, ErrorCodes.ACTIVITY_URL_NOT_ALLOWED)
    assert.deepEqual(error.details, { rejected })
  })

  it('logs nothing when a command boundary converts it to a result', async () => {
    // The gap the service-level guards leave. `CoreUtils.reportError()` calls
    // `.log()` on every `CoreError` it converts, and `log()` spreads `details`
    // into the record -- so declining to log at the throw site only moves the
    // leak here. The error is silent by construction instead.
    const { utils, lines } = makeCapturingUtils()

    const command = utils.createCommand({
      method: 'denyingCommand',
      auth: { mode: 'admin', abilities: [] },
      schemas: { input: z.void(), output: z.object({}) },
      handler: async () => {
        throw activityUrlNotAllowed([{ url: DENIED, reason: 'activity_url_not_allowed' }])
      },
    })

    const result = await command(
      {
        requestId: uuidv7(),
        adminAuth: new AdminAuth(uuidv7(), []),
      } as Parameters<typeof command>[0],
      undefined
    )

    assert.equal(result.ok, false)

    // Nothing anywhere in the emitted output names the URL, its query value or
    // its fragment.
    const emitted = lines.join('')
    assert.doesNotMatch(emitted, /secret-token-value/)
    assert.doesNotMatch(emitted, /fragment-value/)
    assert.doesNotMatch(emitted, /elsewhere\.test/)

    // ...and the host still receives every rejected URL, which is what the
    // activity-code and deep-link forms need to name the offending lines.
    assert.equal(result.ok === false && result.error.code, ErrorCodes.ACTIVITY_URL_NOT_ALLOWED)
    assert.deepEqual(result.ok === false ? result.error.details : undefined, {
      rejected: [{ url: DENIED, reason: 'activity_url_not_allowed' }],
    })
  })

  it('stays silent even when a caller calls log() on it directly', () => {
    // Belt and braces: a throw site that reaches for `.log()` out of habit
    // cannot reintroduce the leak.
    const { logger, lines } = makeCapturingUtils()

    activityUrlNotAllowed([{ url: DENIED, reason: 'activity_url_not_allowed' }]).log(logger)

    assert.doesNotMatch(lines.join(''), /secret-token-value/)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { AgentAuth } from '@/lib/auth.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CoreUtils } from '@/lib/utils.js'
import { ActivityStateCommands } from './commands.js'
import type { TokenRefreshService } from '../auth/services/token-refresh.js'
import type { SetProgressRequest } from './schemas.js'
import type { ActivityPageStateService } from './services/pagestate.js'
import type { ActivityProgressService } from './services/progress.js'

const ORIGIN = 'https://content.test'
const DUPLICATE_MESSAGE = 'increments_for_other_pages contains duplicate target URLs'

/**
 * The real command wrapper over a progress service and token refresh that
 * only record their calls. A validation failure must leave both untouched.
 */
const makeCommands = () => {
  const logLines: string[] = []
  const logger = createCoreLogger({
    pinoLogger: pino(
      { level: 'warn' },
      {
        write: (chunk: string) => {
          logLines.push(chunk)
        },
      }
    ),
  })

  const calls: string[] = []
  const handlerInputs: SetProgressRequest[] = []

  const progressService = {
    setProgress: async (_auth: AgentAuth, request: SetProgressRequest) => {
      calls.push('setProgress')
      handlerInputs.push(request)
      return { progress: request.progress_for_current_page }
    },
  } as unknown as ActivityProgressService

  const tokenRefresh = {
    refreshToken: async () => {
      calls.push('refreshToken')
      return undefined
    },
  } as unknown as TokenRefreshService

  const commands = new ActivityStateCommands({
    utils: new CoreUtils({ logger }),
    progressService,
    pageStateService: {} as unknown as ActivityPageStateService,
    auth: { tokenRefresh },
  })

  const ctx = {
    requestId: 'request-1',
    agentAuth: new AgentAuth(uuidv7(), uuidv7(), uuidv7(), 0),
  }

  return { commands, ctx, calls, handlerInputs, logLines }
}

/** The structured warning entries a run logged. */
const warnings = (logLines: string[]) =>
  logLines
    .map(
      (line) =>
        JSON.parse(line) as {
          level: number
          err?: { code?: string }
          extra?: { issues?: { path: unknown; message: string }[] }
        }
    )
    .filter((entry) => entry.level === 40)

describe('ActivityStateCommands.setProgress duplicate targets', () => {
  it('rejects canonical duplicates before token refresh or the service runs', async () => {
    const m = makeCommands()

    const result = await m.commands.setProgress(m.ctx, {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [
        { url: `${ORIGIN}/lesson`, factor: 0.5 },
        { url: 'HTTPS://CONTENT.TEST:443/lesson?section=2', factor: 0.25 },
      ],
    })

    assert.equal(result.ok, false)
    assert.equal(result.ok ? undefined : result.error.code, 'ERR_VALIDATION')
    assert.deepEqual(m.calls, [])
  })

  it('logs one warning with the duplicate-target issue and no submitted values', async () => {
    const m = makeCommands()
    const body = {
      progress_for_current_page: 0.5,
      increments_for_other_pages: [
        { url: `${ORIGIN}/lesson?token=secret-token-value`, factor: 0.5 },
        { url: `${ORIGIN}:443/lesson#secret-fragment`, factor: 0.5 },
      ],
    }

    await m.commands.setProgress(m.ctx, body)

    const [warning, ...rest] = warnings(m.logLines)
    assert.equal(rest.length, 0, 'exactly one warning')
    assert.ok(warning)
    assert.equal(warning.err?.code, 'ERR_VALIDATION')
    assert.deepEqual(
      warning.extra?.issues?.map(({ path, message }) => ({ path, message })),
      [{ path: ['increments_for_other_pages'], message: DUPLICATE_MESSAGE }]
    )

    const joined = m.logLines.join('\n')
    assert.match(joined, /ERR_VALIDATION/)
    assert.doesNotMatch(joined, /content\.test/)
    assert.doesNotMatch(joined, /secret-token-value/)
    assert.doesNotMatch(joined, /secret-fragment/)
    assert.doesNotMatch(joined, /"factor"/)
    assert.doesNotMatch(joined, /progress_for_current_page/)
  })

  it('hands the service distinct targets with their submitted spellings', async () => {
    const m = makeCommands()
    const targets = [
      { url: 'HTTPS://CONTENT.TEST:443/lesson?section=2', factor: 0.5 },
      { url: `${ORIGIN}/lesson/`, factor: 0.5 },
    ]

    const result = await m.commands.setProgress(m.ctx, {
      progress_for_current_page: 0.5,
      increments_for_other_pages: targets,
    })

    assert.equal(result.ok, true)
    assert.deepEqual(m.calls, ['refreshToken', 'setProgress'])
    assert.deepEqual(m.handlerInputs[0]?.increments_for_other_pages, targets)
  })
})

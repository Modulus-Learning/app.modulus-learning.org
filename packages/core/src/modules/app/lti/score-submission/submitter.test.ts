import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { SubmissionResult } from '@modulus-learning/lti'
import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { createCoreLogger } from '@/lib/logger.js'
import { deadResult, FakeLtiAgsClient, retryableResult, successResult } from '@/test-support/ags.js'
import { testConfig } from '@/test-support/config.js'
import { LtiScoreSubmitter } from './submitter.js'
import type { ClaimedLineItem, LtiScoreSubmissionMutations } from './repository.js'

// The completion event: one line per submission that reached a final platform
// answer, carrying internal ids only.

const ISSUER = 'https://canvas.test'
const LTI_USER_ID = 'lti-user-synthetic-41c2'
const LINEITEM_URL = 'https://canvas.test/api/lti/courses/77/line_items/9'
const DEPLOYMENT_ID = 'deployment-synthetic-9d1e'
const SCORE = 0.75

const supersededResult: SubmissionResult = {
  ok: false,
  category: 'superseded',
  description: 'a newer score is already recorded',
}

/** A logger whose every line is captured, with the call's own fields merged in. */
const capturingLogger = () => {
  const lines: string[] = []
  const logger = createCoreLogger({
    pinoLogger: pino({ level: 'trace' }, { write: (chunk: string) => void lines.push(chunk) }),
  })
  const entries = () =>
    lines.map((line) => {
      const entry = JSON.parse(line)
      return { ...entry, ...(entry.extra ?? {}) } as Record<string, unknown>
    })
  return { logger, lines, entries }
}

const claimedLineItem = (): ClaimedLineItem =>
  ({
    id: uuidv7(),
    scope_id: uuidv7(),
    user_id: uuidv7(),
    activity_id: uuidv7(),
    platform_issuer: ISSUER,
    deployment_id: DEPLOYMENT_ID,
    lineitem_url: LINEITEM_URL,
    lti_user_id: LTI_USER_ID,
    submittable_progress: SCORE,
    submitted_progress: 0,
    submission_error_count: 0,
    submission_lease_token: uuidv7(),
  }) as unknown as ClaimedLineItem

const makeSubmitter = ({
  result,
  leaseValid = true,
  idle = false,
}: {
  result: SubmissionResult
  leaseValid?: boolean
  /** When true, no line item is eligible. */
  idle?: boolean
}) => {
  const capture = capturingLogger()
  const lineitem = idle ? undefined : claimedLineItem()
  const mutations = {
    claimNextEligibleLineItem: async () => lineitem,
    markSubmissionSuccess: async () => leaseValid,
    markSubmissionDead: async () => leaseValid,
    markSubmissionFailure: async () => leaseValid,
  } as unknown as LtiScoreSubmissionMutations
  const submitter = new LtiScoreSubmitter({
    logger: capture.logger,
    config: testConfig,
    scoreSubmissionMutations: mutations,
    agsClient: new FakeLtiAgsClient({ issuer: ISSUER, result }),
  })
  return { submitter, lineitem, ...capture }
}

const completions = (entries: Record<string, unknown>[]) =>
  entries.filter((entry) => entry.msg === 'score submission completed')

/** Nothing identifying or score-bearing may appear in any captured line. */
const assertNoPayload = (lines: string[]) => {
  const all = lines.join('\n')
  for (const value of [LTI_USER_ID, LINEITEM_URL, DEPLOYMENT_ID, 'a newer score is already']) {
    assert.ok(!all.includes(value), `log output must not include ${value}`)
  }
}

describe('LtiScoreSubmitter completion event', () => {
  it('logs one accepted, recorded completion with internal ids only', async () => {
    const { submitter, lineitem, lines, entries } = makeSubmitter({ result: successResult })

    await submitter.processOne()

    const events = completions(entries())
    assert.equal(events.length, 1)
    const event = events[0] as Record<string, unknown>
    assert.equal(event.level, 30)
    assert.equal(event.lineitem_id, lineitem?.id)
    assert.equal(event.scope_id, lineitem?.scope_id)
    assert.equal(event.outcome, 'accepted')
    assert.equal(event.recorded, true)
    for (const field of ['score', 'user_id', 'lti_user_id', 'lineitem_url', 'deployment_id']) {
      assert.ok(!(field in event), `the event must not carry ${field}`)
    }
    assert.ok(!JSON.stringify(event).includes(String(SCORE)))
    assertNoPayload(lines)
  })

  it('reports superseded distinctly, without its response description', async () => {
    const { submitter, lines, entries } = makeSubmitter({ result: supersededResult })

    await submitter.processOne()

    const events = completions(entries())
    assert.equal(events.length, 1)
    assert.equal(events[0]?.outcome, 'superseded')
    assertNoPayload(lines)
  })

  it('reports an accepted submission that lease fencing kept from being recorded', async () => {
    const { submitter, entries } = makeSubmitter({ result: successResult, leaseValid: false })

    await submitter.processOne()

    const all = entries()
    const events = completions(all)
    assert.equal(events.length, 1)
    assert.equal(events[0]?.recorded, false)
    assert.ok(all.some((entry) => entry.msg === 'submission result rejected by lease fencing'))
  })

  for (const [label, result] of [
    ['a retryable failure', retryableResult],
    ['a dead line item', deadResult],
  ] as const) {
    it(`logs no completion for ${label}`, async () => {
      const { submitter, entries } = makeSubmitter({ result })

      await submitter.processOne()

      assert.equal(completions(entries()).length, 0)
    })
  }

  it('logs no completion when nothing is eligible', async () => {
    const { submitter, entries } = makeSubmitter({ result: successResult, idle: true })

    assert.deepEqual(await submitter.processOne(), { type: 'idle' })
    assert.equal(completions(entries()).length, 0)
  })
})

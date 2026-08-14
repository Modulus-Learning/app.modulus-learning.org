import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { DEFAULT_SCOPE_ID } from '@/database/schema/index.js'
import { AgentAuth } from '@/lib/auth.js'
import { seedScenario, seedScope } from '@/test-support/fixtures.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'

let h: TestHarness

before(async () => {
  h = await setupTestHarness()
})

after(async () => {
  await h.teardown()
})

beforeEach(async () => {
  await h.truncateAll()
})

describe('ActivityPageStateService scope partitioning', () => {
  it('returns and updates only the token-scoped snapshot', async () => {
    const s = await seedScenario(h.db)
    const scopeB = await seedScope(h.db, s.platformId)
    const authA = new AgentAuth(s.userId, s.activityId, DEFAULT_SCOPE_ID, 0)
    const authB = new AgentAuth(s.userId, s.activityId, scopeB, 0)

    await h.services.activityPageState.setPageState(authA, {
      page_state: { attempt: 'default' },
    })
    await h.services.activityPageState.setPageState(authB, {
      page_state: { attempt: 'scope-b' },
    })
    await h.services.activityPageState.setPageState(authB, {
      page_state: { attempt: 'scope-b-updated' },
    })

    assert.deepEqual((await h.services.activityPageState.getPageState(authA)).page_state, {
      attempt: 'default',
    })
    assert.deepEqual((await h.services.activityPageState.getPageState(authB)).page_state, {
      attempt: 'scope-b-updated',
    })
  })
})

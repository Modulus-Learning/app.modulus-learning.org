import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { and, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import {
  agentAuthCodes,
  DEFAULT_SCOPE_ID,
  lineitems,
  pageState,
  progress,
  progressEvents,
  scopes,
} from '@/database/schema/index.js'
import { seedLineItem, seedProgress, seedScenario, seedScope } from '@/test-support/fixtures.js'
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

describe('activity scope constraints', () => {
  it('keeps exactly one metadata-free default scope', async () => {
    const rows = await h.db.select().from(scopes).where(eq(scopes.id, DEFAULT_SCOPE_ID))

    assert.equal(rows.length, 1)
    assert.deepEqual(
      {
        platform_id: rows[0]?.platform_id,
        external_id: rows[0]?.external_id,
        name: rows[0]?.name,
        starts_at: rows[0]?.starts_at,
        ends_at: rows[0]?.ends_at,
        last_verified_launch_at: rows[0]?.last_verified_launch_at,
      },
      {
        platform_id: null,
        external_id: null,
        name: null,
        starts_at: null,
        ends_at: null,
        last_verified_launch_at: null,
      }
    )
  })

  it('qualifies external ids by platform and rejects incomplete identities', async () => {
    const first = await seedScenario(h.db)
    const second = await seedScenario(h.db)

    await seedScope(h.db, first.platformId, 'term-1')
    await seedScope(h.db, second.platformId, 'term-1')

    await assert.rejects(seedScope(h.db, first.platformId, 'term-1'))
    await assert.rejects(h.db.insert(scopes).values({ id: uuidv7() }))
    await assert.rejects(
      h.db.insert(scopes).values({ id: uuidv7(), platform_id: first.platformId })
    )
    await assert.rejects(h.db.insert(scopes).values({ id: uuidv7(), external_id: 'term-2' }))
  })

  it('defaults all existing scoped tables to the sentinel', async () => {
    const scenario = await seedScenario(h.db)

    await h.db.insert(agentAuthCodes).values({
      code: 'scope-default-code',
      user_id: scenario.userId,
      client_id: 'scope-default-client',
      redirect_uri: 'https://activity.test/callback',
      code_challenge: 'challenge',
      expires_at: new Date(Date.now() + 60_000),
    })
    await h.db.insert(progress).values({
      user_id: scenario.userId,
      activity_id: scenario.activityId,
      progress: 0.25,
    })
    await h.db.insert(pageState).values({
      user_id: scenario.userId,
      activity_id: scenario.activityId,
      state: '{}',
    })
    await h.db.insert(progressEvents).values({
      user_id: scenario.userId,
      activity_id: scenario.activityId,
      progress: 0.25,
      submitted_at: new Date(),
    })
    const seededLineItem = await seedLineItem(h.db, scenario)

    const [authCode] = await h.db.select({ scopeId: agentAuthCodes.scope_id }).from(agentAuthCodes)
    const [progressRow] = await h.db.select({ scopeId: progress.scope_id }).from(progress)
    const [pageStateRow] = await h.db.select({ scopeId: pageState.scope_id }).from(pageState)
    const [event] = await h.db.select({ scopeId: progressEvents.scope_id }).from(progressEvents)

    assert.deepEqual(
      [
        authCode?.scopeId,
        progressRow?.scopeId,
        pageStateRow?.scopeId,
        event?.scopeId,
        seededLineItem.scope_id,
      ],
      Array.from({ length: 5 }, () => DEFAULT_SCOPE_ID)
    )
  })

  it('upserts launch progress against the sentinel-scoped key', async () => {
    const scenario = await seedScenario(h.db)

    await h.repos.ltiMutations.upsertProgress(scenario.activityId, scenario.userId)
    await h.repos.ltiMutations.upsertProgress(scenario.activityId, scenario.userId)

    const rows = await h.db
      .select()
      .from(progress)
      .where(
        and(eq(progress.user_id, scenario.userId), eq(progress.activity_id, scenario.activityId))
      )

    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.scope_id, DEFAULT_SCOPE_ID)
    assert.equal(rows[0]?.progress, 0)
  })

  it('stores independent progress and page state in two scopes', async () => {
    const scenario = await seedScenario(h.db)
    const firstScopeId = await seedScope(h.db, scenario.platformId, 'term-1')
    const secondScopeId = await seedScope(h.db, scenario.platformId, 'term-2')

    await seedProgress(h.db, scenario.userId, scenario.activityId, 0.25, firstScopeId)
    await seedProgress(h.db, scenario.userId, scenario.activityId, 0.75, secondScopeId)
    await h.db.insert(pageState).values([
      {
        user_id: scenario.userId,
        activity_id: scenario.activityId,
        scope_id: firstScopeId,
        state: '{"scope":1}',
      },
      {
        user_id: scenario.userId,
        activity_id: scenario.activityId,
        scope_id: secondScopeId,
        state: '{"scope":2}',
      },
    ])

    const progressRows = await h.db
      .select()
      .from(progress)
      .where(
        and(eq(progress.user_id, scenario.userId), eq(progress.activity_id, scenario.activityId))
      )
    const pageStateRows = await h.db
      .select()
      .from(pageState)
      .where(
        and(eq(pageState.user_id, scenario.userId), eq(pageState.activity_id, scenario.activityId))
      )

    assert.equal(progressRows.length, 2)
    assert.equal(pageStateRows.length, 2)
  })

  it('retains line-item URL uniqueness across scopes and restricts scope deletion', async () => {
    const scenario = await seedScenario(h.db)
    const firstScopeId = await seedScope(h.db, scenario.platformId, 'term-1')
    const secondScopeId = await seedScope(h.db, scenario.platformId, 'term-2')
    const lineitemUrl = 'https://canvas.test/lineitems/shared'

    await seedLineItem(h.db, scenario, { scope_id: firstScopeId, lineitem_url: lineitemUrl })
    await assert.rejects(
      seedLineItem(h.db, scenario, { scope_id: secondScopeId, lineitem_url: lineitemUrl })
    )
    await assert.rejects(h.db.delete(scopes).where(eq(scopes.id, firstScopeId)))

    const rows = await h.db
      .select({ scopeId: lineitems.scope_id })
      .from(lineitems)
      .where(eq(lineitems.lineitem_url, lineitemUrl))
    assert.deepEqual(rows, [{ scopeId: firstScopeId }])
  })
})

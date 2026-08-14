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
import { resolveVerifiedLaunchScope } from '@/modules/app/lti/services/launch.js'
import {
  type Scenario,
  seedLineItem,
  seedProgress,
  seedProgressEvent,
  seedScenario,
  seedScope,
} from '@/test-support/fixtures.js'
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

describe('platform scope resolution', () => {
  it('creates an id-only scope and later updates metadata without erasing known values', async () => {
    const scenario = await seedScenario(h.db)
    const firstVerifiedAt = new Date('2026-08-01T10:00:00Z')
    const metadataVerifiedAt = new Date('2026-08-02T10:00:00Z')
    const renamedVerifiedAt = new Date('2026-08-03T10:00:00Z')
    const finalVerifiedAt = new Date('2026-08-04T10:00:00Z')

    const created = await h.repos.ltiMutations.resolvePlatformScope({
      platform_id: scenario.platformId,
      external_id: 'term-1',
      last_verified_launch_at: firstVerifiedAt,
    })
    assert.equal(created.name, null)
    assert.equal(created.starts_at, null)
    assert.equal(created.ends_at, null)

    const withMetadata = await h.repos.ltiMutations.resolvePlatformScope({
      platform_id: scenario.platformId,
      external_id: 'term-1',
      name: 'Autumn 2026',
      starts_at: new Date('2026-08-20T00:00:00Z'),
      ends_at: new Date('2026-12-15T23:59:59Z'),
      last_verified_launch_at: metadataVerifiedAt,
    })
    const renamed = await h.repos.ltiMutations.resolvePlatformScope({
      platform_id: scenario.platformId,
      external_id: 'term-1',
      name: 'Autumn Semester 2026',
      last_verified_launch_at: renamedVerifiedAt,
    })
    const unchanged = await h.repos.ltiMutations.resolvePlatformScope({
      platform_id: scenario.platformId,
      external_id: 'term-1',
      last_verified_launch_at: finalVerifiedAt,
    })

    assert.equal(withMetadata.id, created.id)
    assert.equal(renamed.id, created.id)
    assert.equal(unchanged.id, created.id)
    assert.equal(unchanged.name, 'Autumn Semester 2026')
    assert.equal(unchanged.starts_at?.toISOString(), '2026-08-20T00:00:00.000Z')
    assert.equal(unchanged.ends_at?.toISOString(), '2026-12-15T23:59:59.000Z')
    assert.equal(unchanged.last_verified_launch_at?.toISOString(), finalVerifiedAt.toISOString())
  })

  it('converges concurrent resolution on one platform-qualified scope', async () => {
    const scenario = await seedScenario(h.db)
    const verifiedTimes = Array.from(
      { length: 8 },
      (_, index) => new Date(Date.parse('2026-08-05T10:00:00Z') + index * 1000)
    )

    const resolved = await Promise.all(
      verifiedTimes.map((last_verified_launch_at, index) =>
        h.repos.ltiMutations.resolvePlatformScope({
          platform_id: scenario.platformId,
          external_id: 'term-concurrent',
          name: index === 0 ? 'Concurrent Term' : undefined,
          last_verified_launch_at,
        })
      )
    )

    assert.equal(new Set(resolved.map(({ id }) => id)).size, 1)
    const rows = await h.db
      .select()
      .from(scopes)
      .where(
        and(eq(scopes.platform_id, scenario.platformId), eq(scopes.external_id, 'term-concurrent'))
      )
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.name, 'Concurrent Term')
    assert.equal(
      rows[0]?.last_verified_launch_at?.toISOString(),
      verifiedTimes.at(-1)?.toISOString()
    )
  })

  it('does not mutate the sentinel when optional metadata has no usable term id', async () => {
    const scenario = await seedScenario(h.db)

    const resolved = await resolveVerifiedLaunchScope(h.repos.ltiMutations, scenario.platformId, {
      'Canvas.term.name': 'Must not label the sentinel',
      'Canvas.term.startAt': '2026-08-20T00:00:00Z',
      'Canvas.term.endAt': '2026-12-15T23:59:59Z',
    })

    assert.deepEqual(resolved, { scope_id: DEFAULT_SCOPE_ID, scope_name: null })
    const [sentinel] = await h.db.select().from(scopes).where(eq(scopes.id, DEFAULT_SCOPE_ID))
    assert.equal(sentinel?.name, null)
    assert.equal(sentinel?.starts_at, null)
    assert.equal(sentinel?.ends_at, null)
    assert.equal(sentinel?.last_verified_launch_at, null)
  })
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

    await h.repos.ltiMutations.upsertProgress(
      scenario.activityId,
      scenario.userId,
      DEFAULT_SCOPE_ID
    )
    await h.repos.ltiMutations.upsertProgress(
      scenario.activityId,
      scenario.userId,
      DEFAULT_SCOPE_ID
    )

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

  it('initializes launch progress only in the verified scope', async () => {
    const scenario = await seedScenario(h.db)
    const scopeId = await seedScope(h.db, scenario.platformId)
    await seedProgress(h.db, scenario.userId, scenario.activityId, 0.7, DEFAULT_SCOPE_ID)

    await h.repos.ltiMutations.upsertProgress(scenario.activityId, scenario.userId, scopeId)

    const rows = await h.db
      .select()
      .from(progress)
      .where(
        and(eq(progress.user_id, scenario.userId), eq(progress.activity_id, scenario.activityId))
      )
    assert.deepEqual(
      rows
        .map(({ scope_id, progress: value }) => ({ scope_id, progress: value }))
        .sort((a, b) => a.scope_id.localeCompare(b.scope_id)),
      [
        { scope_id: DEFAULT_SCOPE_ID, progress: 0.7 },
        { scope_id: scopeId, progress: 0 },
      ].sort((a, b) => a.scope_id.localeCompare(b.scope_id))
    )
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

describe('line-item scope reconciliation', () => {
  const reconcile = (
    scenario: Scenario,
    scope_id: string,
    overrides: {
      lineitem_url?: string
      submittable_progress?: number
      cutoff_at?: Date | null
    } = {}
  ) =>
    h.tx.withTransaction(() =>
      h.repos.ltiMutations.reconcileLineItem({
        user_id: scenario.userId,
        activity_id: scenario.activityId,
        scope_id,
        platform_issuer: scenario.issuer,
        deployment_id: scenario.deploymentId,
        lineitem_url:
          overrides.lineitem_url ?? 'https://canvas.test/lineitems/scope-reconciliation',
        lti_user_id: 'lti-user-1',
        cutoff_at: overrides.cutoff_at ?? null,
        submittable_progress: overrides.submittable_progress ?? 0,
      })
    )

  it('converges concurrent first launches on one fully initialized row', async () => {
    const scenario = await seedScenario(h.db)
    const scopeId = await seedScope(h.db, scenario.platformId)

    const reconciled = await Promise.all([
      reconcile(scenario, scopeId, { submittable_progress: 0.2 }),
      reconcile(scenario, scopeId, { submittable_progress: 0.7 }),
    ])

    assert.equal(new Set(reconciled.map(({ id }) => id)).size, 1)
    const rows = await h.db.select().from(lineitems)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.scope_id, scopeId)
    assert.equal(rows[0]?.platform_issuer, scenario.issuer)
    assert.equal(rows[0]?.deployment_id, scenario.deploymentId)
    assert.equal(rows[0]?.lti_user_id, 'lti-user-1')
    assert.equal(rows[0]?.submittable_progress, 0.7)
    assert.ok(rows[0]?.submission_eligible_at)
  })

  it('preserves the high-water mark and submission state on a same-scope launch', async () => {
    const scenario = await seedScenario(h.db)
    const scopeId = await seedScope(h.db, scenario.platformId)
    const leaseToken = uuidv7()
    const submittedAt = new Date('2026-01-02T00:00:00Z')
    const eligibleAt = new Date('2026-01-03T00:00:00Z')
    const leaseExpiresAt = new Date('2026-01-04T00:00:00Z')
    const seeded = await seedLineItem(h.db, scenario, {
      scope_id: scopeId,
      lineitem_url: 'https://canvas.test/lineitems/scope-reconciliation',
      submittable_progress: 0.8,
      submitted_progress: 0.4,
      submitted_at: submittedAt,
      submission_eligible_at: eligibleAt,
      submission_lease_token: leaseToken,
      submission_lease_expires_at: leaseExpiresAt,
      submission_error_count: 3,
      submission_error_category: 'transient',
      submission_error_message: 'try again',
      dead_at: new Date('2026-01-01T00:00:00Z'),
    })

    const reconciled = await reconcile(scenario, scopeId, { submittable_progress: 0.5 })

    assert.equal(reconciled.id, seeded.id)
    assert.equal(reconciled.scope_id, scopeId)
    assert.equal(reconciled.submittable_progress, 0.8)
    assert.equal(reconciled.submitted_progress, 0.4)
    assert.equal(reconciled.submitted_at?.getTime(), submittedAt.getTime())
    assert.equal(reconciled.submission_lease_token, leaseToken)
    assert.equal(reconciled.submission_lease_expires_at?.getTime(), leaseExpiresAt.getTime())
    assert.equal(reconciled.submission_error_count, 3)
    assert.equal(reconciled.submission_error_category, 'transient')
    assert.equal(reconciled.submission_error_message, 'try again')
    assert.equal(reconciled.dead_at, null, 'the ordinary launch revives the row')
    assert.equal(reconciled.submission_eligible_at?.getTime(), eligibleAt.getTime())
  })

  it('rebinds to a new scope and resets all stale submission state', async () => {
    const scenario = await seedScenario(h.db)
    const scopeA = await seedScope(h.db, scenario.platformId, 'term-a')
    const scopeB = await seedScope(h.db, scenario.platformId, 'term-b')
    const lineitemUrl = 'https://canvas.test/lineitems/scope-reconciliation'
    const seeded = await seedLineItem(h.db, scenario, {
      scope_id: scopeA,
      lineitem_url: lineitemUrl,
      submittable_progress: 0.8,
      submitted_progress: 0.6,
      submitted_at: new Date('2026-01-02T00:00:00Z'),
      submission_eligible_at: new Date('2026-01-03T00:00:00Z'),
      submission_lease_token: uuidv7(),
      submission_lease_expires_at: new Date('2026-01-04T00:00:00Z'),
      submission_error_count: 3,
      submission_error_category: 'transient',
      submission_error_message: 'try again',
      dead_at: new Date('2026-01-01T00:00:00Z'),
    })
    const eventAt = new Date('2026-02-01T00:00:00Z')
    await seedProgress(h.db, scenario.userId, scenario.activityId, 0.8, scopeA)
    await seedProgress(h.db, scenario.userId, scenario.activityId, 0.3, scopeB)
    await seedProgressEvent(h.db, scenario.userId, scenario.activityId, 0.8, eventAt, scopeA)
    await seedProgressEvent(h.db, scenario.userId, scenario.activityId, 0.3, eventAt, scopeB)
    const scopeBProgress = await h.repos.ltiQueries.getProgressWithCutoff(
      scenario.userId,
      scenario.activityId,
      scopeB,
      undefined
    )

    const reconciled = await reconcile(scenario, scopeB, {
      lineitem_url: lineitemUrl,
      submittable_progress: scopeBProgress,
    })

    assert.equal(reconciled.id, seeded.id)
    assert.equal(reconciled.scope_id, scopeB)
    assert.equal(reconciled.submittable_progress, 0.3)
    assert.equal(reconciled.submitted_progress, 0)
    assert.equal(reconciled.submitted_at, null)
    assert.equal(reconciled.dead_at, null)
    assert.equal(reconciled.submission_error_count, 0)
    assert.equal(reconciled.submission_error_category, null)
    assert.equal(reconciled.submission_error_message, null)
    assert.equal(reconciled.submission_lease_token, null)
    assert.equal(reconciled.submission_lease_expires_at, null)
    assert.ok(reconciled.submission_eligible_at)

    const stateRows = await h.db
      .select()
      .from(progressEvents)
      .where(eq(progressEvents.activity_id, scenario.activityId))
    assert.deepEqual(
      stateRows
        .map(({ scope_id, progress }) => ({ scope_id, progress }))
        .sort((a, b) => a.scope_id.localeCompare(b.scope_id)),
      [
        { scope_id: scopeA, progress: 0.8 },
        { scope_id: scopeB, progress: 0.3 },
      ].sort((a, b) => a.scope_id.localeCompare(b.scope_id))
    )
    const progressRows = await h.db
      .select()
      .from(progress)
      .where(eq(progress.activity_id, scenario.activityId))
    assert.deepEqual(
      progressRows
        .map(({ scope_id, progress: value }) => ({ scope_id, progress: value }))
        .sort((a, b) => a.scope_id.localeCompare(b.scope_id)),
      [
        { scope_id: scopeA, progress: 0.8 },
        { scope_id: scopeB, progress: 0.3 },
      ].sort((a, b) => a.scope_id.localeCompare(b.scope_id))
    )
  })

  it('rebinds to exactly zero when the new scope has no progress', async () => {
    const scenario = await seedScenario(h.db)
    const scopeA = await seedScope(h.db, scenario.platformId, 'term-a')
    const scopeB = await seedScope(h.db, scenario.platformId, 'term-b')
    await seedLineItem(h.db, scenario, {
      scope_id: scopeA,
      lineitem_url: 'https://canvas.test/lineitems/scope-reconciliation',
      submittable_progress: 0.8,
    })

    const progressInB = await h.repos.ltiQueries.getProgressWithCutoff(
      scenario.userId,
      scenario.activityId,
      scopeB,
      undefined
    )
    const reconciled = await reconcile(scenario, scopeB, {
      submittable_progress: progressInB,
    })

    assert.equal(reconciled.scope_id, scopeB)
    assert.equal(reconciled.submittable_progress, 0)
  })

  it('serializes concurrent same-scope and rebind branches into one coherent state', async () => {
    const scenario = await seedScenario(h.db)
    const scopeA = await seedScope(h.db, scenario.platformId, 'term-a')
    const scopeB = await seedScope(h.db, scenario.platformId, 'term-b')
    await seedLineItem(h.db, scenario, {
      scope_id: scopeA,
      lineitem_url: 'https://canvas.test/lineitems/scope-reconciliation',
      submittable_progress: 0.8,
      submitted_progress: 0.6,
      submission_lease_token: uuidv7(),
      submission_lease_expires_at: new Date(Date.now() + 60_000),
      submission_error_count: 2,
      submission_error_category: 'transient',
      submission_error_message: 'stale',
    })

    await Promise.all([
      reconcile(scenario, scopeA, { submittable_progress: 0.8 }),
      reconcile(scenario, scopeB, { submittable_progress: 0.3 }),
    ])

    const [row] = await h.db.select().from(lineitems)
    assert.ok(row)
    if (row.scope_id === scopeA) {
      assert.equal(row.submittable_progress, 0.8)
    } else {
      assert.equal(row.scope_id, scopeB)
      assert.equal(row.submittable_progress, 0.3)
    }
    assert.equal(row.submitted_progress, 0)
    assert.equal(row.submission_lease_token, null)
    assert.equal(row.submission_error_count, 0)
  })
})

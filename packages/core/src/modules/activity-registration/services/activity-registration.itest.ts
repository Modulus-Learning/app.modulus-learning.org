import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import { activities } from '@/database/schema/index.js'
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

const ORIGIN = 'https://content.test'

/** Adds one enabled whole-origin rule, so the policy admits `ORIGIN`. */
const seedRule = async (origin = ORIGIN, path_prefix = '/'): Promise<string> => {
  const created = await h.repos.allowlistMutations.createRule({
    id: uuidv7(),
    origin,
    path_prefix,
  })
  assert.ok(created)
  return created.id
}

const countActivities = async (url: string): Promise<number> => {
  const rows = await h.db.select().from(activities).where(eq(activities.url, url))
  return rows.length
}

const allActivityUrls = async (): Promise<string[]> => {
  const rows = await h.db.select({ url: activities.url }).from(activities)
  return rows.map(({ url }) => url)
}

/** A policy loader that fails the test if registration ever reads policy. */
const noPolicyRead = async (): Promise<never> => {
  assert.fail('a known activity must not load or evaluate policy')
}

describe('ActivityRegistrationService.register over PostgreSQL', () => {
  it('allows new URLs with no rules and after deleting the last enabled rule', async () => {
    const url = `${ORIGIN}/first`
    assert.equal(
      (
        await h.services.activityRegistration.register(
          url,
          await h.services.activityRegistration.loadPolicy()
        )
      ).ok,
      true
    )
    assert.equal(await countActivities(url), 1)

    const ruleId = await seedRule('https://other.test')
    const nextUrl = `${ORIGIN}/next`
    assert.equal(
      (
        await h.services.activityRegistration.register(
          nextUrl,
          await h.services.activityRegistration.loadPolicy()
        )
      ).ok,
      false
    )
    assert.equal(await countActivities(nextUrl), 0)
    await h.repos.allowlistMutations.deleteRule(ruleId)
    assert.equal(
      (
        await h.services.activityRegistration.register(
          nextUrl,
          await h.services.activityRegistration.loadPolicy()
        )
      ).ok,
      true
    )
    assert.equal(await countActivities(nextUrl), 1)
  })

  it('admits an unseen url under an enabled rule and stores exactly one row', async () => {
    await seedRule()
    const url = `${ORIGIN}/course/calculus`

    const policy = await h.services.activityRegistration.loadPolicy()
    const outcome = await h.services.activityRegistration.register(url, policy)

    assert.equal(outcome.ok, true)
    assert.equal(await countActivities(url), 1)
  })

  it('admits an unseen url when every rule is disabled', async () => {
    await h.repos.allowlistMutations.createRule({
      id: uuidv7(),
      origin: ORIGIN,
      path_prefix: '/',
      is_enabled: false,
    })
    const url = `${ORIGIN}/course/calculus`

    const policy = await h.services.activityRegistration.loadPolicy()
    const outcome = await h.services.activityRegistration.register(url, policy)

    assert.equal(outcome.ok, true)
    assert.equal(await countActivities(url), 1)
  })

  it('resolves two concurrent registrations of the same url to one winning row', async () => {
    // The create race, which cannot be proved against a fake: two instructors
    // deep linking the same new URL at the same moment is ordinary behaviour,
    // and both must succeed against the single row that wins.
    await seedRule()
    const url = `${ORIGIN}/course/calculus`

    const policy = await h.services.activityRegistration.loadPolicy()
    const [first, second] = await Promise.all([
      h.services.activityRegistration.register(url, policy),
      h.services.activityRegistration.register(url, policy),
    ])

    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    assert.ok(first.ok && second.ok)
    // Both callers resolved to the same row, and only one row exists.
    assert.equal(first.activity.id, second.activity.id)
    assert.equal(await countActivities(url), 1)
  })

  it('admits a url already registered before any rule existed', async () => {
    // Grandfathering over the real table: the activity predates the policy and
    // no enabled rule matches it, yet it resolves.
    const url = `${ORIGIN}/legacy/page`
    await h.db.insert(activities).values({ id: uuidv7(), url })
    await seedRule('https://somewhere-else.test')

    const policy = await h.services.activityRegistration.loadPolicy()
    const outcome = await h.services.activityRegistration.register(url, policy)

    assert.equal(outcome.ok, true)
    assert.equal(await countActivities(url), 1)
  })

  it('admits a url against a snapshot taken before the rule was disabled', async () => {
    // Characterization guard, not a defect. A snapshot is read once per
    // admission operation and is deliberately not re-checked against
    // concurrent policy edits: an admission already in flight completes. Do
    // not "fix" this by serializing registration against allowlist mutation --
    // the accepted race is the design, and locking the policy table on every
    // registration is the cost this avoids.
    const ruleId = await seedRule()
    await seedRule('https://other.test')
    const url = `${ORIGIN}/course/calculus`

    const policy = await h.services.activityRegistration.loadPolicy()
    await h.repos.allowlistMutations.updateRule(ruleId, { is_enabled: false })

    const outcome = await h.services.activityRegistration.register(url, policy)

    assert.equal(outcome.ok, true)
    assert.equal(await countActivities(url), 1)

    // The next operation takes a fresh snapshot and denies.
    const nextPolicy = await h.services.activityRegistration.loadPolicy()
    const next = await h.services.activityRegistration.register(`${ORIGIN}/other`, nextPolicy)
    assert.equal(next.ok, false)
  })

  it('resolves concurrent registrations of equivalent spellings to one canonical row', async () => {
    // The race the canonical key exists for: different spellings of one page
    // must contend on the same unique value, not create two activities.
    await seedRule()
    const canonical = `${ORIGIN}/course/calculus`
    const spellings = [
      'HTTPS://CONTENT.TEST:443/course/calculus?week=1',
      'https://content.test/course/./calculus#section-2',
      'https://Content.Test/unit/../course/calculus',
    ]

    const policy = await h.services.activityRegistration.loadPolicy()
    const outcomes = await Promise.all(
      spellings.map((url) => h.services.activityRegistration.register(url, policy))
    )

    const ids = outcomes.map((outcome) => {
      assert.ok(outcome.ok)
      assert.equal(outcome.activity.url, canonical)
      return outcome.activity.id
    })
    assert.equal(new Set(ids).size, 1)
    assert.deepEqual(await allActivityUrls(), [canonical])
  })

  it('denies an unseen url under a nonmatching enabled rule', async () => {
    await seedRule('https://other.test')
    const url = 'HTTPS://CONTENT.TEST:443/course/unseen?week=1'

    const policy = await h.services.activityRegistration.loadPolicy()
    const outcome = await h.services.activityRegistration.register(url, policy)

    assert.deepEqual(outcome, { ok: false, url, reason: 'activity_url_not_allowed' })
    assert.deepEqual(await allActivityUrls(), [])
  })

  it('resolves equivalent spellings of an existing activity without evaluating policy', async () => {
    const canonical = `${ORIGIN}/legacy/page`
    const id = uuidv7()
    await h.db.insert(activities).values({ id, url: canonical })
    await seedRule('https://other.test')

    for (const url of [
      canonical,
      'HTTPS://content.test:443/legacy/page',
      'https://content.test/legacy/./page?attempt=2#q3',
    ]) {
      const outcome = await h.services.activityRegistration.register(url, noPolicyRead)
      assert.ok(outcome.ok)
      assert.equal(outcome.activity.id, id)
    }
    assert.deepEqual(await allActivityUrls(), [canonical])
  })

  it('resolves a seeded parseable but inadmissible url without a new syntax gate', async () => {
    // Synthetic fixture, not a data-compatibility mechanism: an existing row
    // that today's admission syntax would refuse (plain HTTP to a non-loopback
    // host) still resolves, because lookup precedes admission. Its unseen
    // counterpart must still fail admission.
    const canonical = 'http://content.test/legacy/page'
    const id = uuidv7()
    await h.db.insert(activities).values({ id, url: canonical })

    const known = await h.services.activityRegistration.register(
      'HTTP://CONTENT.TEST:80/legacy/page?x=1',
      noPolicyRead
    )
    assert.ok(known.ok)
    assert.equal(known.activity.id, id)

    const unseenUrl = 'http://content.test/legacy/other'
    const unseen = await h.services.activityRegistration.register(
      unseenUrl,
      await h.services.activityRegistration.loadPolicy()
    )
    assert.deepEqual(unseen, { ok: false, url: unseenUrl, reason: 'malformed_url' })
    assert.deepEqual(await allActivityUrls(), [canonical])
  })

  it('reports url_too_long for a url the column cannot hold', async () => {
    await seedRule()
    const url = `${ORIGIN}/${'a'.repeat(256)}`

    const policy = await h.services.activityRegistration.loadPolicy()
    const outcome = await h.services.activityRegistration.register(url, policy)

    assert.deepEqual(outcome, { ok: false, url, reason: 'url_too_long' })
    assert.equal(await countActivities(url), 0)
  })
})

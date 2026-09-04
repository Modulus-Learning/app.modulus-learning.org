import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { and, eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'

import { activityUrlAllowlistRules, adminUsers } from '@/database/schema/index.js'
import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import type { AllowlistRuleInsert, AllowlistRuleRecord } from './index.js'

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

/** Seeds one administrator, whose id the rules use for provenance. */
const seedAdminUser = async (): Promise<string> => {
  const id = uuidv7()
  await h.db.insert(adminUsers).values({
    id,
    username: `admin-${id.slice(-12)}`,
    email: `${id}@admin.test`,
  })
  return id
}

const countRules = async (origin: string, path_prefix: string): Promise<number> => {
  const rows = await h.db
    .select()
    .from(activityUrlAllowlistRules)
    .where(
      and(
        eq(activityUrlAllowlistRules.origin, origin),
        eq(activityUrlAllowlistRules.path_prefix, path_prefix)
      )
    )
  return rows.length
}

const rule = (overrides: Partial<AllowlistRuleInsert> = {}): AllowlistRuleInsert => ({
  id: uuidv7(),
  origin: 'https://content.test',
  path_prefix: '/',
  ...overrides,
})

/**
 * Creates a rule and asserts it was inserted. Every test but the collision case
 * below writes a distinct base, so an `undefined` return there is a failure,
 * not a case to handle.
 */
const createRule = async (
  overrides: Partial<AllowlistRuleInsert> = {}
): Promise<AllowlistRuleRecord> => {
  const created = await h.repos.allowlistMutations.createRule(rule(overrides))
  assert.ok(created, 'expected the rule to be inserted')
  return created
}

describe('ActivityUrlAllowlistMutations.createRule', () => {
  it('stores an enabled rule and returns it with both provenance columns', async () => {
    const adminId = await seedAdminUser()

    const created = await createRule({
      origin: 'https://ximera.test',
      path_prefix: '/courses/algebra',
      description: 'the algebra course',
      created_by: adminId,
      updated_by: adminId,
    })

    assert.equal(created.origin, 'https://ximera.test')
    assert.equal(created.path_prefix, '/courses/algebra')
    assert.equal(created.description, 'the algebra course')
    assert.equal(created.is_enabled, true)
    assert.equal(created.created_by, adminId)
    assert.equal(created.updated_by, adminId)

    const found = await h.repos.allowlistQueries.findRuleById(created.id)
    assert.deepEqual(found, created)
  })

  it('does nothing on a second rule for the same origin and path prefix', async () => {
    const first = await h.repos.allowlistMutations.createRule(
      rule({ origin: 'https://ximera.test', path_prefix: '/courses/algebra' })
    )

    const second = await h.repos.allowlistMutations.createRule(
      rule({ origin: 'https://ximera.test', path_prefix: '/courses/algebra' })
    )

    // The constraint is live, and the insert absorbs the collision rather than
    // raising: two administrators submitting the same base URL at the same
    // moment must both get an answer about the resulting state, not one of
    // them a unique-violation error. The caller re-reads to find the winner.
    assert.equal(second, undefined)
    assert.equal(await countRules('https://ximera.test', '/courses/algebra'), 1)

    const survivor = await h.repos.allowlistQueries.findRuleByBase(
      'https://ximera.test',
      '/courses/algebra'
    )
    assert.equal(survivor?.id, first?.id)
  })
})

describe('ActivityUrlAllowlistQueries', () => {
  it('omits a disabled rule from listEnabledRules but not from listRules', async () => {
    const enabled = await createRule({ origin: 'https://a.test', path_prefix: '/' })
    const disabled = await createRule({
      origin: 'https://b.test',
      path_prefix: '/',
      is_enabled: false,
    })

    const all = await h.repos.allowlistQueries.listRules()
    assert.deepEqual(
      all.map(({ id }) => id),
      [enabled.id, disabled.id]
    )

    // Deny-by-default rests on this read: a disabled rule admits nothing.
    const enabledOnly = await h.repos.allowlistQueries.listEnabledRules()
    assert.deepEqual(
      enabledOnly.map(({ id }) => id),
      [enabled.id]
    )
  })

  it('returns no enabled rules when every rule is disabled', async () => {
    await createRule({ is_enabled: false })

    assert.deepEqual(await h.repos.allowlistQueries.listEnabledRules(), [])
  })

  it('finds a rule by its normalized base, enabled or not', async () => {
    const created = await createRule({
      origin: 'https://ximera.test',
      path_prefix: '/courses',
      is_enabled: false,
    })

    const found = await h.repos.allowlistQueries.findRuleByBase('https://ximera.test', '/courses')
    assert.equal(found?.id, created.id)

    assert.equal(
      await h.repos.allowlistQueries.findRuleByBase('https://ximera.test', '/'),
      undefined
    )
  })
})

describe('ActivityUrlAllowlistMutations.updateRule', () => {
  it('re-enables a rule with its description and creator intact', async () => {
    const author = await seedAdminUser()
    const editor = await seedAdminUser()

    const created = await createRule({
      description: 'approved for the pilot',
      is_enabled: false,
      created_by: author,
      updated_by: author,
    })

    const updated = await h.repos.allowlistMutations.updateRule(created.id, {
      is_enabled: true,
      updated_by: editor,
    })

    assert.equal(updated?.is_enabled, true)
    assert.equal(updated?.updated_by, editor)
    // Re-enabling must not discard why the rule exists or who wrote it.
    assert.equal(updated?.description, 'approved for the pilot')
    assert.equal(updated?.created_by, author)
  })
})

describe('allowlist rule provenance', () => {
  it('keeps the rule and nulls created_by when the administrator is deleted', async () => {
    const adminId = await seedAdminUser()
    const created = await createRule({ created_by: adminId, updated_by: adminId })

    await h.db.delete(adminUsers).where(eq(adminUsers.id, adminId))

    // Removing an administrator must not silently drop site policy.
    const survivor = await h.repos.allowlistQueries.findRuleById(created.id)
    assert.equal(survivor?.id, created.id)
    assert.equal(survivor?.created_by, null)
    assert.equal(survivor?.updated_by, null)
    assert.equal(survivor?.is_enabled, true)
  })
})

describe('ActivityUrlAllowlistMutations.deleteRule', () => {
  it('removes the rule', async () => {
    const created = await createRule()

    await h.repos.allowlistMutations.deleteRule(created.id)

    const remaining = await h.db
      .select()
      .from(activityUrlAllowlistRules)
      .where(eq(activityUrlAllowlistRules.id, created.id))
    assert.deepEqual(remaining, [])
  })
})

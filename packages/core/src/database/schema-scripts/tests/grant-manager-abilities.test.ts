/**
 * The grant-manager-abilities release script against PostgreSQL: it brings an
 * existing Manager role up to the reference data, is safe to re-run, and
 * touches no other role.
 */
import assert from 'node:assert/strict'

import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

import { setupTestHarness, type TestHarness } from '@/test-support/pg.js'
import { readReleaseScripts } from '../files.js'

const SCRIPT = '2026-11-12-001-grant-manager-abilities.sql'

const GRANTED = [
  'lti-platforms:read',
  'lti-platforms:edit',
  'activity-url-allowlist:list',
  'activity-url-allowlist:manage',
]

let h: TestHarness

beforeAll(async () => {
  h = await setupTestHarness()
})

afterAll(async () => {
  await h.teardown()
})

beforeEach(async () => {
  await h.truncateAll()
})

const script = (): string => {
  const found = readReleaseScripts().find(({ name }) => name === SCRIPT)
  assert.ok(found, `${SCRIPT} is not a release script`)
  return found.sql
}

const insertRole = async (machineName: string, abilities: string[]): Promise<string> => {
  const id = uuidv7()
  await h.pool.query('INSERT INTO admin_roles (id, name, machine_name) VALUES ($1, $2, $3)', [
    id,
    machineName,
    machineName,
  ])
  for (const ability of abilities) {
    await h.pool.query(
      'INSERT INTO admin_permissions (id, admin_role_id, ability) VALUES ($1, $2, $3)',
      [uuidv7(), id, ability]
    )
  }
  return id
}

const abilityCounts = async (roleId: string): Promise<Record<string, number>> => {
  const { rows } = await h.pool.query<{ ability: string; count: string }>(
    `SELECT ability, count(*) AS count FROM admin_permissions
     WHERE admin_role_id = $1 GROUP BY ability`,
    [roleId]
  )
  return Object.fromEntries(rows.map(({ ability, count }) => [ability, Number(count)]))
}

describe('grant-manager-abilities release script', () => {
  it('grants each ability to the Manager role exactly once, across two runs', async () => {
    const manager = await insertRole('manager', ['lti-platforms:list', 'lti-platforms:read'])
    const user = await insertRole('user', ['users:list'])

    await h.pool.query(script())
    await h.pool.query(script())

    const counts = await abilityCounts(manager)
    for (const ability of GRANTED) {
      assert.equal(counts[ability], 1, ability)
    }
    assert.equal(counts['lti-platforms:list'], 1)
    assert.deepEqual(await abilityCounts(user), { 'users:list': 1 })
  })

  it('accepts a database with no Manager role', async () => {
    const user = await insertRole('user', ['users:list'])

    await h.pool.query(script())

    assert.deepEqual(await abilityCounts(user), { 'users:list': 1 })
  })
})

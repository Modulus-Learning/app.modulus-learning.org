import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'

import { createCoreLogger } from '@/lib/logger.js'
import { AllowlistPolicyService } from './allowlist-policy.js'
import type { ActivityUrlAllowlistQueries, AllowlistRuleRecord } from '../repository/index.js'

const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })

const ruleRecord = (origin: string, path_prefix = '/', is_enabled = true): AllowlistRuleRecord => ({
  id: uuidv7(),
  origin,
  path_prefix,
  description: null,
  is_enabled,
  created_by: null,
  updated_by: null,
  created_at: new Date(),
  updated_at: new Date(),
})

/**
 * Builds the service over a fake `queries` that records how many times the
 * enabled-rule read happened. The call count is the only way the
 * single-snapshot rule is observable from outside, so every test that cares
 * about it asserts on `reads`.
 */
const makeService = (stored: AllowlistRuleRecord[] = []) => {
  let reads = 0

  const service = new AllowlistPolicyService({
    logger,
    queries: {
      // The repository filters in SQL; the fake filters here, so the service
      // is never handed a disabled rule it might silently honour.
      listEnabledRules: async () => {
        reads += 1
        return stored.filter(({ is_enabled }) => is_enabled)
      },
    } as unknown as ActivityUrlAllowlistQueries,
  })

  return { service, reads: () => reads }
}

describe('AllowlistPolicyService.loadPolicy', () => {
  it('returns only the enabled rules, in the matcher shape', async () => {
    const { service } = makeService([
      ruleRecord('https://content.example', '/'),
      ruleRecord('https://other.example', '/course/calculus'),
      ruleRecord('https://disabled.example', '/', false),
    ])

    const policy = await service.loadPolicy()

    assert.deepEqual(policy.rules, [
      { origin: 'https://content.example', path_prefix: '/' },
      { origin: 'https://other.example', path_prefix: '/course/calculus' },
    ])
  })

  it('returns an empty snapshot when no rules exist', async () => {
    const { service } = makeService()

    assert.deepEqual(await service.loadPolicy(), { rules: [] })
  })
})

describe('AllowlistPolicyService.evaluate', () => {
  it('denies every candidate when the snapshot is empty', async () => {
    // Deny-by-default: a fresh install, having no rules, admits nothing. This
    // deliberately supersedes the allow-all proposal in DYNAMIC-ACTIVITIES.md.
    const { service } = makeService()
    const policy = await service.loadPolicy()

    for (const candidate of [
      'https://content.example/',
      'https://content.example/course/calculus',
      'http://localhost:3000/x',
    ]) {
      assert.deepEqual(
        service.evaluate(candidate, policy),
        { ok: false, reason: 'activity_url_not_allowed' },
        candidate
      )
    }
  })

  it('denies when rules exist but every one of them is disabled', async () => {
    const { service } = makeService([
      ruleRecord('https://content.example', '/', false),
      ruleRecord('https://other.example', '/', false),
    ])
    const policy = await service.loadPolicy()

    assert.deepEqual(policy.rules, [])
    assert.deepEqual(service.evaluate('https://content.example/x', policy), {
      ok: false,
      reason: 'activity_url_not_allowed',
    })
  })

  it('allows a candidate under a whole-origin rule and under a subtree rule', async () => {
    const { service } = makeService([
      ruleRecord('https://content.example', '/'),
      ruleRecord('https://other.example', '/course/calculus'),
    ])
    const policy = await service.loadPolicy()

    const anywhere = service.evaluate('https://content.example/anything/at/all', policy)
    assert.equal(anywhere.ok, true)
    assert.equal(anywhere.ok && anywhere.url.pathname, '/anything/at/all')

    const subtree = service.evaluate('https://other.example/course/calculus/week-1', policy)
    assert.equal(subtree.ok, true)
    assert.equal(subtree.ok && subtree.url.origin, 'https://other.example')
  })

  it('denies a sibling path and a deceptive host prefix', async () => {
    // Thin integration over the matcher's own exhaustive cases: it proves the
    // service calls `matchesRule` rather than growing a comparison of its own.
    const { service } = makeService([ruleRecord('https://trusted.example', '/course/calculus')])
    const policy = await service.loadPolicy()

    for (const candidate of [
      'https://trusted.example/course/calculus-2',
      'https://trusted.example.evil/course/calculus',
      'https://trusted.example/other',
    ]) {
      assert.deepEqual(
        service.evaluate(candidate, policy),
        { ok: false, reason: 'activity_url_not_allowed' },
        candidate
      )
    }
  })

  it('reports malformed_url for a non-admissible scheme and a bare string', async () => {
    const { service } = makeService([ruleRecord('https://content.example', '/')])
    const policy = await service.loadPolicy()

    for (const candidate of ['javascript:alert(1)', 'not-a-url', 'http://content.example/x']) {
      assert.deepEqual(
        service.evaluate(candidate, policy),
        { ok: false, reason: 'malformed_url' },
        candidate
      )
    }
  })

  it('never reports url_too_long, which belongs to the writer', async () => {
    // The 255-character bound is a property of the `activities.url` column, so
    // it is checked by the registration service, not here.
    const { service } = makeService([ruleRecord('https://content.example', '/')])
    const policy = await service.loadPolicy()

    const long = `https://content.example/${'a'.repeat(400)}`
    assert.deepEqual(service.evaluate(long, policy), {
      ok: true,
      url: new URL(long),
    })
  })
})

describe('AllowlistPolicyService snapshot discipline', () => {
  it('reads the rules once per operation and never again during evaluate', async () => {
    const { service, reads } = makeService([ruleRecord('https://content.example', '/')])

    const policy = await service.loadPolicy()
    assert.equal(reads(), 1)

    // Five URLs, as an activity-code submission would carry, all decided
    // against the one snapshot.
    for (let i = 0; i < 5; i++) {
      service.evaluate(`https://content.example/page-${i}`, policy)
    }

    assert.equal(reads(), 1)
  })

  it('takes a fresh snapshot on the next operation, with no cache in between', async () => {
    const rule = ruleRecord('https://content.example', '/')
    const { service, reads } = makeService([rule])

    const before = await service.loadPolicy()
    assert.equal(service.evaluate('https://content.example/x', before).ok, true)

    // An administrator disables the rule on another instance.
    rule.is_enabled = false

    const after = await service.loadPolicy()
    assert.equal(reads(), 2)
    assert.deepEqual(service.evaluate('https://content.example/x', after), {
      ok: false,
      reason: 'activity_url_not_allowed',
    })
  })
})

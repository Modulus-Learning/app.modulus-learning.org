import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { compareLedger, RELEASE_SCRIPT_PATTERN } from './compare.js'

const a = { name: '2026-01-01-001-a.sql', checksum: 'aaa' }
const b = { name: '2026-01-02-001-b.sql', checksum: 'bbb' }

describe('compareLedger', () => {
  it('is ok when the ledger matches the shipped scripts', () => {
    assert.deepEqual(compareLedger([a, b], [a, b]), { status: 'ok' })
  })

  it('reports a missing ledger and whether Modulus tables exist', () => {
    assert.deepEqual(compareLedger([a], null, true), {
      status: 'no-ledger',
      hasModulusTables: true,
    })
  })

  it('reports shipped scripts that are not applied', () => {
    assert.deepEqual(compareLedger([a, b], [a]), { status: 'pending', scripts: [b.name] })
  })

  it('reports applied scripts the build does not ship', () => {
    assert.deepEqual(compareLedger([a], [a, b]), { status: 'newer', scripts: [b.name] })
  })

  it('reports a database with both unknown and missing scripts as divergent', () => {
    const c = { name: '2026-01-03-001-c.sql', checksum: 'ccc' }
    assert.deepEqual(compareLedger([a, b], [a, c]), {
      status: 'divergent',
      pending: [b.name],
      unknown: [c.name],
    })
  })

  it('reports a changed checksum before anything else', () => {
    const changed = { ...a, checksum: 'zzz' }
    assert.deepEqual(compareLedger([a, b], [changed]), { status: 'mismatch', scripts: [a.name] })
  })
})

describe('RELEASE_SCRIPT_PATTERN', () => {
  it('accepts release script names and rejects everything else', () => {
    assert.ok(RELEASE_SCRIPT_PATTERN.test('2026-09-09-001-migrate-activity-url-allowlist.sql'))
    assert.ok(!RELEASE_SCRIPT_PATTERN.test('baseline.sql'))
    assert.ok(!RELEASE_SCRIPT_PATTERN.test('modulus-deploy-2026-01-13.sql'))
    assert.ok(!RELEASE_SCRIPT_PATTERN.test('2026-03-26-001-x copy.sql'))
  })
})

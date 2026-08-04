import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { assertTestDatabase } from '@/test-support/pg.js'

describe('assertTestDatabase', () => {
  it('accepts a PostgreSQL database whose name ends in _test', () => {
    const connectionString = 'postgres://modulus:modulus@127.0.0.1:5432/modulus_test'
    assert.equal(assertTestDatabase(connectionString), connectionString)
  })

  it('rejects a missing connection string', () => {
    assert.throws(() => assertTestDatabase(undefined), /POSTGRES_CONNECTION_STRING is not set/)
  })

  it('rejects development and production-shaped database names', () => {
    assert.throws(
      () => assertTestDatabase('postgres://modulus:modulus@127.0.0.1:5432/modulus_dev'),
      /must end in '_test'/
    )
    assert.throws(
      () => assertTestDatabase('postgres://modulus:modulus@127.0.0.1:5432/modulus'),
      /must end in '_test'/
    )
  })

  it('rejects non-PostgreSQL and malformed URLs', () => {
    assert.throws(
      () => assertTestDatabase('mysql://modulus:modulus@127.0.0.1:3306/modulus_test'),
      /protocol must be postgres/
    )
    assert.throws(() => assertTestDatabase('not a URL'), /not a valid URL/)
  })
})

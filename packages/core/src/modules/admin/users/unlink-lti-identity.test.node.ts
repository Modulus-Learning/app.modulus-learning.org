import assert from 'node:assert/strict'

import { drizzle } from 'drizzle-orm/node-postgres'
import { pino } from 'pino'
import { v7 as uuidv7 } from 'uuid'
import { describe, it } from 'vitest'

import * as schema from '@/database/schema/index.js'
import { AdminAuth } from '@/lib/auth.js'
import { DBManagerImpl } from '@/lib/db-manager.js'
import { CoreError } from '@/lib/errors.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CoreUtils } from '@/lib/utils.js'
import { UserCommands } from './commands.js'
import { sqlStateOf, UserMutations, type UserQueries } from './repository/index.js'
import { ltiSubjectHash, UserService } from './services/users.js'
import type { TXManager } from '@/lib/db-manager.js'
import type { Mailer } from '@/lib/email/services/mailer.js'

// A distinctive synthetic subject: if it appears anywhere in a log line or a
// public error, the privacy guarantee of the unlink path has failed.
const SUBJECT = 'synthetic-lti-subject-7f3a9c'
const ISSUER = 'https://canvas.test'

/** A logger whose every level is captured as a raw JSON line. */
const capturingLogger = () => {
  const lines: string[] = []
  const logger = createCoreLogger({
    pinoLogger: pino({ level: 'trace' }, { write: (chunk: string) => void lines.push(chunk) }),
  })
  return { logger, lines }
}

type Row = { id: string; vid: number; lti_iss: string | null; lti_sub: string | null }

/** A mutations double over one in-memory row, applying the conditional update's rule. */
const fakeMutations = (row: Row | undefined) => {
  const calls: unknown[] = []
  const mutations = {
    getUserLtiIdentity: async () => (row == null ? undefined : { ...row }),
    unlinkLtiIdentity: async (params: Row) => {
      calls.push(params)
      if (
        row == null ||
        row.vid !== params.vid ||
        row.lti_iss !== params.lti_iss ||
        row.lti_sub !== params.lti_sub
      ) {
        return undefined
      }
      row.vid += 1
      row.lti_iss = null
      row.lti_sub = null
      return { vid: row.vid }
    },
  } as unknown as UserMutations
  return { mutations, calls }
}

const makeService = (mutations: UserMutations, logger = capturingLogger().logger) =>
  new UserService({
    logger,
    tx: {} as TXManager,
    mailer: {} as Mailer,
    queries: {} as UserQueries,
    mutations,
  })

const admin = (abilities = ['users:edit']) => new AdminAuth(uuidv7(), abilities)

const linkedRow = (): Row => ({ id: uuidv7(), vid: 3, lti_iss: ISSUER, lti_sub: SUBJECT })

const requestFor = (row: Row) => ({
  id: row.id,
  vid: row.vid,
  lti_iss: row.lti_iss,
  lti_sub: row.lti_sub,
})

const auditLines = (lines: string[]) =>
  lines.filter((line) => line.includes('lti identity unlinked'))

/** The core logger nests a call's own fields under `extra`. */
const fieldsOf = (line: string): Record<string, unknown> => {
  const entry = JSON.parse(line)
  return { ...entry, ...(entry.extra ?? {}) }
}

describe('UserService.unlinkLtiIdentity', () => {
  it('clears a matching identity, bumps vid and emits one audit event', async () => {
    const { logger, lines } = capturingLogger()
    const row = linkedRow()
    const auth = admin()
    const service = makeService(fakeMutations(row).mutations, logger)

    const result = await service.unlinkLtiIdentity(auth, requestFor(row))

    assert.deepEqual(result, { changed: true, vid: 4 })
    const audits = auditLines(lines)
    assert.equal(audits.length, 1)
    const event = fieldsOf(audits[0] as string)
    assert.equal(event.actor_admin_id, auth.admin_id)
    assert.equal(event.target_user_id, row.id)
    assert.equal(event.issuer, ISSUER)
    assert.equal(event.subject_hash, ltiSubjectHash(SUBJECT))
    assert.ok(!lines.join('\n').includes(SUBJECT), 'the raw subject must not be logged')
  })

  it('is a no-op for an already unlinked account, and audits nothing', async () => {
    const { logger, lines } = capturingLogger()
    const row: Row = { id: uuidv7(), vid: 5, lti_iss: null, lti_sub: null }
    const { mutations, calls } = fakeMutations(row)

    const result = await makeService(mutations, logger).unlinkLtiIdentity(admin(), requestFor(row))

    assert.deepEqual(result, { changed: false, vid: 5 })
    assert.equal(calls.length, 0, 'nothing is written')
    assert.equal(auditLines(lines).length, 0)
  })

  it('refuses a stale vid with ERR_VERSION_CONFLICT, and audits nothing', async () => {
    const { logger, lines } = capturingLogger()
    const row = linkedRow()
    const service = makeService(fakeMutations(row).mutations, logger)

    await assert.rejects(
      service.unlinkLtiIdentity(admin(), { ...requestFor(row), vid: row.vid - 1 }),
      (error: unknown) => error instanceof CoreError && error.code === 'ERR_VERSION_CONFLICT'
    )
    assert.equal(auditLines(lines).length, 0)
  })

  it('refuses when the identity changed since the page was loaded', async () => {
    const row = linkedRow()
    const service = makeService(fakeMutations(row).mutations)

    await assert.rejects(
      service.unlinkLtiIdentity(admin(), { ...requestFor(row), lti_sub: 'an-older-subject' }),
      (error: unknown) => error instanceof CoreError && error.code === 'ERR_VERSION_CONFLICT'
    )
  })

  it('clears a partial identity (one column set)', async () => {
    const row: Row = { id: uuidv7(), vid: 1, lti_iss: ISSUER, lti_sub: null }

    const result = await makeService(fakeMutations(row).mutations).unlinkLtiIdentity(
      admin(),
      requestFor(row)
    )

    assert.deepEqual(result, { changed: true, vid: 2 })
  })

  it('gives ERR_NOT_FOUND for a missing user', async () => {
    const service = makeService(fakeMutations(undefined).mutations)

    await assert.rejects(
      service.unlinkLtiIdentity(admin(), {
        id: uuidv7(),
        vid: 1,
        lti_iss: ISSUER,
        lti_sub: SUBJECT,
      }),
      (error: unknown) => error instanceof CoreError && error.code === 'ERR_NOT_FOUND'
    )
  })
})

describe('UserMutations unlink path, on a database failure', () => {
  // A real Drizzle instance over a client whose every query fails, so the
  // error passes through Drizzle (whose query error carries the parameter
  // list, including the raw subject) and then the repository's own catch.
  const failingRepository = (code: unknown) => {
    const { logger, lines } = capturingLogger()
    const client = {
      query: async () => {
        throw Object.assign(new Error(`driver failure near ${SUBJECT}`), { code })
      },
    }
    const db = new DBManagerImpl({ dbPool: drizzle(client as never, { schema }) })
    const mutations = new UserMutations({ logger, utils: new CoreUtils({ logger }), db })
    return { mutations, lines, logger }
  }

  const chainText = (error: unknown): string => {
    const parts: string[] = []
    let current: unknown = error
    for (let depth = 0; depth < 10 && current != null; depth++) {
      parts.push(String(current), JSON.stringify(current) ?? '')
      if (current instanceof CoreError) {
        parts.push(JSON.stringify(current.report()))
      }
      current = (current as { cause?: unknown }).cause
    }
    return parts.join('\n')
  }

  for (const method of ['unlinkLtiIdentity', 'getUserLtiIdentity'] as const) {
    it(`${method}: no subject in logs or the public error; the SQLSTATE is kept`, async () => {
      const { mutations, lines } = failingRepository('40001')
      const target = uuidv7()

      const call =
        method === 'unlinkLtiIdentity'
          ? mutations.unlinkLtiIdentity({ id: target, vid: 1, lti_iss: ISSUER, lti_sub: SUBJECT })
          : mutations.getUserLtiIdentity(target)

      const error = await call.then(
        () => assert.fail('expected a database error'),
        (caught: unknown) => caught
      )

      assert.ok(error instanceof CoreError)
      assert.equal(error.code, 'ERR_DATABASE')
      assert.equal(error.cause, undefined, 'the database error is not attached')
      assert.ok(!chainText(error).includes(SUBJECT), 'the public error carries no subject')

      const logged = lines.join('\n')
      assert.ok(!logged.includes(SUBJECT), 'no log line carries the subject')
      const record = lines.map(fieldsOf).find((entry) => entry.pg_code)
      assert.equal(record?.pg_code, '40001')
      assert.equal(record?.target_user_id, target)
    })
  }

  it('logs no pg_code when the driver code is not a SQLSTATE', async () => {
    const { mutations, lines } = failingRepository(`not-a-code ${SUBJECT}`)

    await assert.rejects(mutations.getUserLtiIdentity(uuidv7()))

    assert.ok(!lines.join('\n').includes(SUBJECT))
    const record = lines.map(fieldsOf).find((entry) => 'pg_code' in entry)
    assert.equal(record?.pg_code, null)
  })
})

describe('sqlStateOf', () => {
  it('accepts only a five-character SQLSTATE, through the cause chain', () => {
    assert.equal(sqlStateOf({ cause: { code: '23505' } }), '23505')
    assert.equal(sqlStateOf({ code: 'ECONNREFUSED' }), null)
    assert.equal(sqlStateOf({ code: 12345 }), null)
    assert.equal(sqlStateOf('23505'), null)
  })
})

describe('UserCommands.unlinkUserLtiIdentity authorisation', () => {
  const makeCommands = () => {
    const { logger } = capturingLogger()
    const row = linkedRow()
    const { mutations, calls } = fakeMutations(row)
    const commands = new UserCommands({
      utils: new CoreUtils({ logger }),
      service: makeService(mutations, logger),
    })
    return { commands, row, calls }
  }

  it('refuses an admin without users:edit, before the handler runs', async () => {
    const { commands, row, calls } = makeCommands()

    const result = await commands.unlinkUserLtiIdentity(
      { adminAuth: admin(['users:read', 'users:list']), requestId: uuidv7() },
      requestFor(row)
    )

    assert.equal(result.ok, false)
    assert.equal(!result.ok && result.error.code, 'ERR_FORBIDDEN')
    assert.equal(calls.length, 0)
  })

  it('runs for an admin with users:edit', async () => {
    const { commands, row } = makeCommands()

    const result = await commands.unlinkUserLtiIdentity(
      { adminAuth: admin(['users:edit']), requestId: uuidv7() },
      requestFor(row)
    )

    assert.deepEqual(result.ok && result.data, { changed: true, vid: 4 })
  })
})

/**
 * Characterisation of LTI sign-in: how a verified launch identity is matched
 * to a Modulus account. Pinned before the email-linking policy change recorded
 * in specs/2026-10-25-canvas-lti-package-extraction-spec.md (scoped linking:
 * never re-point an account that already has a different LTI identity).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { v7 as uuidv7 } from 'uuid'

import { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
import { silentLogger } from '@/test-support/lti.js'
import type {
  SessionMutations,
  SessionQueries,
  UserInsert,
  UserRecord,
} from '@/modules/app/session/repository/index.js'

const ISSUER = 'https://canvas.characterisation.test'

const userRecord = (overrides: Partial<UserRecord> = {}): UserRecord =>
  ({
    id: uuidv7(),
    full_name: 'Existing User',
    email: 'learner@example.test',
    lti_iss: null,
    lti_sub: null,
    is_enabled: true,
    remember_me: false,
    ...overrides,
  }) as UserRecord

type World = {
  byLtiId?: UserRecord
  byEmail?: UserRecord
  createReturns?: UserRecord | 'absent'
  /** A concurrent launch linked a different identity first. */
  linkLost?: boolean
  /** After a lost creation race, the row the second lookup finds. */
  afterRace?: UserRecord
}

const createService = (world: World) => {
  const calls = {
    emailLookups: [] as string[],
    updates: [] as Partial<UserInsert>[],
    links: [] as Array<{ user_id: string; lti_iss: string; lti_sub: string }>,
    created: [] as UserInsert[],
    roleLookups: [] as string[][],
    rolesAdded: [] as Array<{ user_id: string; role_ids: string[] }>,
    logins: [] as Array<{ outcome: string; user_id: string }>,
  }
  let ltiLookups = 0
  const service = new LtiSignInService({
    logger: silentLogger(),
    queries: {
      findUserByLtiId: async () => (ltiLookups++ === 0 ? world.byLtiId : world.afterRace),
      findUserByEmail: async (email: string) => {
        calls.emailLookups.push(email)
        return world.byEmail
      },
      findRoleIdsByMachineName: async (names: string[]) => {
        calls.roleLookups.push(names)
        return names.map((name) => `role-${name}`)
      },
      getUserAbilities: async () => ['ability'],
    } as unknown as SessionQueries,
    mutations: {
      createLtiUserIfAbsent: async (values: UserInsert) => {
        calls.created.push(values)
        if (world.createReturns === 'absent') return undefined
        return world.createReturns ?? userRecord({ ...values } as Partial<UserRecord>)
      },
      linkLtiIdentity: async (user_id: string, lti_iss: string, lti_sub: string) => {
        calls.links.push({ user_id, lti_iss, lti_sub })
        if (world.linkLost) return undefined
        return { ...(world.byEmail as UserRecord), lti_iss, lti_sub }
      },
      updateUser: async (user: UserRecord, update: Partial<UserInsert>) => {
        calls.updates.push(update)
        return { ...user, ...update } as UserRecord
      },
      addUserToRoles: async (user_id: string, role_ids: string[]) => {
        calls.rolesAdded.push({ user_id, role_ids })
      },
      recordLogin: async (login: { outcome: string; user_id: string }) => {
        calls.logins.push({ outcome: login.outcome, user_id: login.user_id })
      },
    } as unknown as SessionMutations,
  })
  return { service, calls }
}

const credentials = {
  iss: ISSUER,
  sub: 'canvas-sub-1',
  name: 'Launch User',
  email: 'learner@example.test',
}

describe('LtiSignInService.signInLti', () => {
  it('signs in the account already linked to this issuer and subject', async () => {
    const linked = userRecord({ lti_iss: ISSUER, lti_sub: 'canvas-sub-1' })
    const { service, calls } = createService({ byLtiId: linked })
    const result = await service.signInLti(credentials, false)

    assert.equal(result.user.id, linked.id)
    assert.deepEqual(calls.emailLookups, [])
    assert.equal(calls.updates.length, 1)
    assert.equal(calls.updates[0]?.lti_iss, undefined)
    assert.equal(calls.updates[0]?.last_provider, 'lti')
    assert.deepEqual(calls.logins, [{ outcome: 'success', user_id: linked.id }])
  })

  it('fills in a missing email from the launch on an existing account', async () => {
    const linked = userRecord({ email: null, lti_iss: ISSUER, lti_sub: 'canvas-sub-1' })
    const { service, calls } = createService({ byLtiId: linked })
    await service.signInLti(credentials, false)
    assert.equal(calls.updates[0]?.email, 'learner@example.test')
  })

  it('links an account with no LTI identity by email', async () => {
    const byEmail = userRecord({ lti_iss: null, lti_sub: null })
    const { service, calls } = createService({ byEmail })
    const result = await service.signInLti(credentials, false)

    assert.equal(result.user.id, byEmail.id)
    assert.deepEqual(calls.emailLookups, ['learner@example.test'])
    assert.deepEqual(calls.links, [
      { user_id: byEmail.id, lti_iss: ISSUER, lti_sub: 'canvas-sub-1' },
    ])
    assert.equal(calls.updates[0]?.lti_iss, undefined)
    assert.equal(result.user.id, byEmail.id)
    assert.deepEqual(calls.created, [])
  })

  it('refuses the launch when a concurrent launch linked a different identity first', async () => {
    const byEmail = userRecord({ lti_iss: null, lti_sub: null })
    const { service, calls } = createService({ byEmail, linkLost: true })
    await assert.rejects(service.signInLti(credentials, false), (error) => {
      assert.equal((error as { code?: string }).code, 'ERR_LTI_IDENTITY_CONFLICT')
      return true
    })
    assert.equal(calls.links.length, 1)
    assert.deepEqual(calls.updates, [])
    assert.deepEqual(calls.logins, [])
  })

  it('refuses to re-point an account linked to a different LTI identity by email', async () => {
    const other = userRecord({ lti_iss: 'https://other-lms.test', lti_sub: 'other-sub' })
    const { service, calls } = createService({ byEmail: other })
    await assert.rejects(service.signInLti(credentials, false), (error) => {
      assert.equal((error as { code?: string }).code, 'ERR_LTI_IDENTITY_CONFLICT')
      return true
    })
    assert.deepEqual(calls.links, [])
    assert.deepEqual(calls.updates, [])
    assert.deepEqual(calls.created, [])
    assert.deepEqual(calls.logins, [])
  })

  it('creates a learner account when nothing matches', async () => {
    const { service, calls } = createService({})
    await service.signInLti(credentials, false)

    assert.equal(calls.created.length, 1)
    const created = calls.created[0]
    assert.equal(created?.email, 'learner@example.test')
    assert.equal(created?.full_name, 'Launch User')
    assert.equal(created?.lti_iss, ISSUER)
    assert.equal(created?.lti_sub, 'canvas-sub-1')
    assert.equal(created?.is_enabled, true)
    assert.equal(created?.last_provider, 'lti')
    assert.deepEqual(calls.roleLookups, [['everyone', 'learner']])
    assert.deepEqual(calls.updates, [])
  })

  it('creates an instructor account for an instructor launch', async () => {
    const { service, calls } = createService({})
    await service.signInLti(credentials, true)
    assert.deepEqual(calls.roleLookups, [['everyone', 'instructor']])
  })

  it('does not look up by email when the launch carries none', async () => {
    const { service, calls } = createService({})
    const { email: _omitted, ...withoutEmail } = credentials
    await service.signInLti(withoutEmail, false)
    assert.deepEqual(calls.emailLookups, [])
    assert.equal(calls.created.length, 1)
  })

  it('adopts the winning row when a concurrent launch created the account first', async () => {
    const winner = userRecord({ lti_iss: ISSUER, lti_sub: 'canvas-sub-1' })
    const { service, calls } = createService({ createReturns: 'absent', afterRace: winner })
    const result = await service.signInLti(credentials, false)
    assert.equal(result.user.id, winner.id)
    assert.equal(calls.updates.length, 1)
  })

  it('adds the instructor role to an existing account on an instructor launch', async () => {
    const linked = userRecord({ lti_iss: ISSUER, lti_sub: 'canvas-sub-1' })
    const { service, calls } = createService({ byLtiId: linked })
    await service.signInLti(credentials, true)
    assert.deepEqual(calls.rolesAdded, [{ user_id: linked.id, role_ids: ['role-instructor'] }])
  })

  it('refuses a disabled account and records the failed login', async () => {
    const disabled = userRecord({ lti_iss: ISSUER, lti_sub: 'canvas-sub-1', is_enabled: false })
    const { service, calls } = createService({ byLtiId: disabled })
    await assert.rejects(service.signInLti(credentials, false))
    assert.deepEqual(calls.logins, [{ outcome: 'failed_disabled', user_id: disabled.id }])
    assert.deepEqual(calls.updates, [])
  })
})

import { describe, expect, test } from 'vitest'

import { bootstrapStep, ssrRecoveryHref } from './bootstrap'

describe('ssrRecoveryHref (server-render recovery, bounded by the URL marker)', () => {
  test('first expiry on a navigation → the bootstrap, carrying the return path', () => {
    expect(ssrRecoveryHref('user', '/dashboard/x?y=1')).toBe(
      '/auth/renew?return=%2Fdashboard%2Fx%3Fy%3D1'
    )
    expect(ssrRecoveryHref('admin', '/admin/users')).toBe('/admin/renew?return=%2Fadmin%2Fusers')
  })

  test('still expired after coming back from the bootstrap → sign-in, never a loop', () => {
    expect(ssrRecoveryHref('user', '/dashboard?_renewed=1')).toBe(
      '/sign-in?callbackUrl=%2Fdashboard'
    )
    expect(ssrRecoveryHref('admin', '/admin/users?_renewed=1')).toBe(
      '/admin/sign-in?callbackUrl=%2Fadmin%2Fusers'
    )
  })

  test('an unsafe path falls back to the domain default', () => {
    expect(ssrRecoveryHref('user', '//evil.test/x')).toBe('/auth/renew?return=%2Fdashboard')
  })
})

describe('bootstrapStep', () => {
  const principal = { domain: 'user' as const, userId: 'u' }

  test.each(['renewed', 'unchanged'] as const)('%s → back to return with the marker', (status) => {
    expect(
      bootstrapStep({
        domain: 'user',
        outcome: { status, principal },
        returnParam: '/dashboard?tab=1',
        framed: false,
      })
    ).toEqual({ kind: 'navigate', href: '/dashboard?tab=1&_renewed=1' })
  })

  test('terminal, top level → sign-in with the return path (marker stripped)', () => {
    expect(
      bootstrapStep({
        domain: 'admin',
        outcome: { status: 'terminal' },
        returnParam: '/admin/users?_renewed=1',
        framed: false,
      })
    ).toEqual({ kind: 'navigate', href: '/admin/sign-in?callbackUrl=%2Fadmin%2Fusers' })
  })

  test('terminal learner inside the Canvas frame → session unavailable (no sign-in dead end)', () => {
    expect(
      bootstrapStep({
        domain: 'user',
        outcome: { status: 'terminal' },
        returnParam: '/dashboard',
        framed: true,
      })
    ).toEqual({ kind: 'session-unavailable' })
  })

  test('transient → a bounded retry state, no navigation', () => {
    expect(
      bootstrapStep({
        domain: 'user',
        outcome: { status: 'transient' },
        returnParam: '/dashboard',
        framed: false,
      })
    ).toEqual({ kind: 'retry' })
  })

  test.each(['https://evil.test/', '//evil.test', '\\\\evil', null])(
    'an unsafe return %j is replaced by the default',
    (returnParam) => {
      expect(
        bootstrapStep({
          domain: 'user',
          outcome: { status: 'renewed', principal },
          returnParam,
          framed: false,
        })
      ).toEqual({ kind: 'navigate', href: '/dashboard?_renewed=1' })
    }
  )
})

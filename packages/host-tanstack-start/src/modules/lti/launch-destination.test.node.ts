import { describe, expect, test } from 'vitest'

import { selectLaunchDestination } from './launch-destination'

const activityId = '019c2d8e-9f01-7a4e-9c2f-2b7c1d9a5e11'
const scopeId = '019c2d8e-842a-7715-a323-a7e31427db2d'
const modulusServerUrl = 'https://modulus.test'
const activityUrl = 'https://content.test/activity'

const select = (mode: 'never' | 'always', overrides: { activityUrl?: string } = {}) =>
  selectLaunchDestination({
    mode,
    activityId,
    activityUrl: overrides.activityUrl ?? activityUrl,
    scopeId,
    modulusServerUrl,
  })

describe('selectLaunchDestination', () => {
  test('never sends the learner straight to the activity, adding only two parameters', () => {
    const destination = new URL(select('never'))

    expect(destination.origin + destination.pathname).toBe(activityUrl)
    expect([...destination.searchParams.keys()].toSorted()).toEqual(['modulus', 'scope_id'])
    expect(destination.searchParams.get('modulus')).toBe(modulusServerUrl)
    expect(destination.searchParams.get('scope_id')).toBe(scopeId)
  })

  test('never preserves an authored query, fragment, and percent escape', () => {
    const authored = 'https://content.test/a%20b/activity?discount=50%25&existing=one#authored'
    const destination = new URL(select('never', { activityUrl: authored }))

    expect(destination.pathname).toBe('/a%20b/activity')
    expect(destination.searchParams.get('discount')).toBe('50%')
    expect(destination.searchParams.get('existing')).toBe('one')
    expect(destination.hash).toBe('#authored')
    expect(destination.searchParams.get('modulus')).toBe(modulusServerUrl)
    expect(destination.searchParams.get('scope_id')).toBe(scopeId)
  })

  test('always sends the learner to the id-keyed interstitial', () => {
    expect(select('always')).toBe(`/lti/launch/${activityId}?scope_id=${scopeId}`)
  })

  test('no mode embeds an activity URL in a Modulus-owned URL', () => {
    // The `always` target is the whole point of re-keying: nothing about the
    // activity's own URL travels through a path Modulus owns.
    const always = select('always')

    expect(always).not.toContain('content.test')
    expect(always).not.toContain(encodeURIComponent(activityUrl))
  })

  test('no mode can leak a scope name, because none is in scope to leak', () => {
    // A guard against a future signature change: the scope name is passed
    // nowhere near this function, so neither output can carry it.
    const scopeName = 'Autumn 2026'

    for (const mode of ['never', 'always'] as const) {
      expect(select(mode)).not.toContain(scopeName)
      expect(select(mode)).not.toContain(encodeURIComponent(scopeName))
    }
  })
})

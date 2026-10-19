import { describe, expect, test } from 'vitest'

import { config } from './proxy'

/**
 * The matcher decides which paths the proxy chain runs on. `withI18n` rewrites
 * anything it matches to `/[lng]/…`, so a top-level route group that is not
 * excluded is rewritten to a path that does not exist and 404s.
 *
 * Next compiles `source` itself; this reproduces the negative-lookahead form
 * closely enough to pin which prefixes are excluded, which is the property the
 * chromeless route groups depend on.
 */
const matches = (pathname: string): boolean => {
  const source = config.matcher[0]?.source
  if (source === undefined) {
    throw new Error('expected the proxy matcher to declare a source')
  }
  return new RegExp(`^${source.replace(/^'|'$/g, '')}$`).test(pathname)
}

describe('proxy matcher exclusions', () => {
  test.each([
    ['/agent/error', 'the chromeless agent error page'],
    ['/lti/error', 'the chromeless LTI error page'],
  ])('excludes %s (%s)', (pathname) => {
    // Excluded, so `withI18n` does not rewrite it to `/[lng]/…` -- which does
    // not exist, and would give the learner a 404 instead of the error page.
    expect(matches(pathname)).toBe(false)
  })

  test.each([
    ['/routes/agent/authorize', 'the agent OAuth authorization handler'],
    ['/routes/agent/token', 'the agent token handler'],
  ])('still matches %s (%s)', (pathname) => {
    // The agent API handlers live under /routes/agent/* and do not start with
    // /agent, so excluding /agent must not take the proxy off them: they still
    // need withRequestId and withDeploymentMode.
    expect(matches(pathname)).toBe(true)
  })

  test('still matches an ordinary application path', () => {
    expect(matches('/en/dashboard')).toBe(true)
  })
})

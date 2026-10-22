import { describe, expect, test } from 'vitest'

import { classifyRoute, isRouteAllowed } from './deployment-mode'

describe('classifyRoute', () => {
  test.each([
    ['/admin', 'admin'],
    ['/es/admin/users', 'admin'],
    ['/routes/admin/refresh', 'admin'],
    ['/', 'frontend'],
    ['/sign-in', 'frontend'],
    ['/lti/error', 'frontend'],
    ['/agent/error', 'frontend'],
    ['/routes/lti/launch', 'frontend'],
    ['/routes/lti/register', 'frontend'],
    ['/routes/agent/token', 'frontend'],
    ['/routes/elb-status', 'neutral'],
    ['/routes/keep-alive', 'neutral'],
    ['/_serverFn/abc', 'neutral'],
    ['/_build/index-1.js', 'neutral'],
    ['/fonts/Inter/Inter.woff2', 'neutral'],
    ['/modules/js/script.js', 'neutral'],
  ] as const)('%s → %s', (path, expected) => {
    expect(classifyRoute(path)).toBe(expected)
  })

  test('a neutral prefix only matches whole segments', () => {
    expect(classifyRoute('/_buildings')).toBe('frontend')
    expect(classifyRoute('/fontsize')).toBe('frontend')
  })
})

describe('isRouteAllowed', () => {
  test('all-in-one allows everything', () => {
    for (const path of ['/admin', '/sign-in', '/_serverFn/x']) {
      expect(isRouteAllowed('all-in-one', path)).toBe(true)
    }
  })

  test('single-surface modes allow their own surface plus neutral paths', () => {
    expect(isRouteAllowed('frontend', '/sign-in')).toBe(true)
    expect(isRouteAllowed('frontend', '/admin')).toBe(false)
    expect(isRouteAllowed('frontend', '/_serverFn/x')).toBe(true)
    expect(isRouteAllowed('admin', '/admin')).toBe(true)
    expect(isRouteAllowed('admin', '/sign-in')).toBe(false)
    expect(isRouteAllowed('admin', '/_serverFn/x')).toBe(true)
  })
})

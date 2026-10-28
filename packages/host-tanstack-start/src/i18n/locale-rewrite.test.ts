import { describe, expect, it } from 'vitest'

import { isLocalizablePath, localeInputRewrite, localeOutputRewrite } from './locale-rewrite'

const input = (path: string) => {
  const url = localeInputRewrite(new URL(path, 'https://modulus.test'))
  return `${url.pathname}${url.search}${url.hash}`
}
const output = (path: string) => {
  const url = localeOutputRewrite(new URL(path, 'https://modulus.test'))
  return `${url.pathname}${url.search}${url.hash}`
}

describe('localeInputRewrite — the matcher always sees a locale segment', () => {
  it('prepends the default locale to bare localizable paths', () => {
    expect(input('/')).toBe('/en')
    expect(input('/sign-in')).toBe('/en/sign-in')
    expect(input('/dashboard/activity-code/1')).toBe('/en/dashboard/activity-code/1')
    expect(input('/admin/users')).toBe('/en/admin/users')
  })

  it('leaves an existing locale prefix untouched', () => {
    expect(input('/es')).toBe('/es')
    expect(input('/es/sign-in')).toBe('/es/sign-in')
    expect(input('/en/about')).toBe('/en/about')
  })

  it.each([
    '/lti/error',
    '/lti/launch/abc',
    '/agent/error',
    '/routes/lti/launch',
    '/routes/lti/register',
    '/auth/renew',
    '/_serverFn/abc',
    '/_build/index.js',
    '/assets/favicon.ico',
    '/fonts/Inter/Inter.woff2',
    '/modules/js/script.js',
  ])('never prefixes the non-localized path %s', (path) => {
    expect(input(path)).toBe(path)
  })

  it('never prefixes static files', () => {
    expect(input('/favicon.ico')).toBe('/favicon.ico')
    expect(input('/site.webmanifest')).toBe('/site.webmanifest')
  })

  it('preserves search and hash', () => {
    expect(input('/sign-in?callbackUrl=%2Fdashboard#x')).toBe(
      '/en/sign-in?callbackUrl=%2Fdashboard#x'
    )
  })
})

describe('localeOutputRewrite — de-DEFAULT, never de-LOCALIZE', () => {
  it('strips a leading default-locale segment', () => {
    expect(output('/en')).toBe('/')
    expect(output('/en/sign-in')).toBe('/sign-in')
    expect(output('/en/admin?x=1')).toBe('/admin?x=1')
  })

  it('preserves every non-default locale', () => {
    expect(output('/es')).toBe('/es')
    expect(output('/es/sign-in')).toBe('/es/sign-in')
  })

  it('leaves non-localized paths untouched', () => {
    expect(output('/lti/error')).toBe('/lti/error')
    expect(output('/routes/agent/token')).toBe('/routes/agent/token')
  })

  it('does not strip a segment that merely starts with the locale code', () => {
    expect(output('/english/page')).toBe('/english/page')
    expect(output('/enrol')).toBe('/enrol')
  })
})

describe('input ∘ output round-trips to the original public URL', () => {
  it.each([
    '/',
    '/sign-in',
    '/sign-up',
    '/about',
    '/docs',
    '/docs/introduction',
    '/dashboard',
    '/account',
    '/start-activity/code/https:/x.test/page',
    '/admin',
    '/admin/users/1/edit',
    '/es',
    '/es/sign-in',
    '/es/admin/users',
    '/lti/error?code=invalid_request',
    '/auth/renew?return=%2Fdashboard',
  ])('%s', (path) => {
    expect(output(input(path))).toBe(path)
  })
})

describe('isLocalizablePath', () => {
  it('classifies frontend vs system paths', () => {
    expect(isLocalizablePath('/')).toBe(true)
    expect(isLocalizablePath('/admin')).toBe(true)
    expect(isLocalizablePath('/lti/error')).toBe(false)
    expect(isLocalizablePath('/routes/elb-status')).toBe(false)
    expect(isLocalizablePath('/robots.txt')).toBe(false)
  })
})

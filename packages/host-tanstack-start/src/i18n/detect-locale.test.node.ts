import { describe, expect, test } from 'vitest'

import { detectLocale } from './detect-locale'

describe('detectLocale', () => {
  test('cookie > path > Accept-Language > default', () => {
    expect(detectLocale({ cookie: 'es', pathLocale: 'en', acceptLanguage: 'en' })).toBe('es')
    expect(detectLocale({ pathLocale: 'es', acceptLanguage: 'en' })).toBe('es')
    expect(detectLocale({ acceptLanguage: 'es-ES,es;q=0.8' })).toBe('es')
    expect(detectLocale({})).toBe('en')
  })

  test('ignores a tampered cookie or path value', () => {
    expect(detectLocale({ cookie: 'xx', pathLocale: 'yy', acceptLanguage: 'es' })).toBe('es')
  })

  test('a malformed Accept-Language header falls back to the default', () => {
    expect(detectLocale({ acceptLanguage: '!!!,;;;' })).toBe('en')
    expect(detectLocale({ acceptLanguage: 'fr-FR' })).toBe('en')
  })
})

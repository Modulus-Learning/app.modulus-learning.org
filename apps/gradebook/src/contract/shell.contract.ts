import { describe, expect, test } from 'vitest'

import { request, serves, TARGET } from './client'

// The document shell each area renders: `lang` and `data-theme-context` on
// `<html>`. Next set these per route-group layout; Start derives them from the
// deepest match's `staticData`, so this pins the two together (spec: Task 16).
const htmlTag = async (path: string) => {
  const response = await request(path)
  expect(response.status).toBe(200)
  const tag = (await response.text()).match(/<html\b[^>]*>/)?.[0]
  expect(tag).toBeDefined()
  return tag as string
}

const attribute = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null

describe.runIf(serves('frontend'))('document shell — frontend', () => {
  test.each([
    ['/', 'en', 'public'],
    ['/es/about', 'es', 'public'],
    ['/sign-in', 'en', 'public'],
  ])('GET %s → lang=%s, theme context %s', async (path, lang, themeContext) => {
    const tag = await htmlTag(path)
    expect(attribute(tag, 'lang')).toBe(lang)
    expect(attribute(tag, 'data-theme-context')).toBe(themeContext)
  })
})

describe.runIf(serves('admin'))('document shell — admin', () => {
  test('GET /admin/sign-in → lang=en, protected theme context', async () => {
    const tag = await htmlTag('/admin/sign-in')
    expect(attribute(tag, 'lang')).toBe('en')
    expect(attribute(tag, 'data-theme-context')).toBe('protected')
  })

  // Next never served this page: its `withAdminAuth` matches only an unprefixed
  // `/admin`, so `/es/admin/*` falls to the learner middleware — a self-redirect
  // in all-in-one, and a 500 on an admin instance (no learner cookie config).
  test.runIf(TARGET === 'start')(
    'GET /es/admin/sign-in → lang=es, protected theme context (Next: loop or 500)',
    async () => {
      const tag = await htmlTag('/es/admin/sign-in')
      expect(attribute(tag, 'lang')).toBe('es')
      expect(attribute(tag, 'data-theme-context')).toBe('protected')
    }
  )
})

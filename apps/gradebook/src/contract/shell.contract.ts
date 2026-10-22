import { describe, expect, test } from 'vitest'

import { request, serves } from './client'

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
  test.each([
    ['/admin/sign-in', 'en'],
    ['/es/admin/sign-in', 'es'],
  ])('GET %s → lang=%s, protected theme context', async (path, lang) => {
    const tag = await htmlTag(path)
    expect(attribute(tag, 'lang')).toBe(lang)
    expect(attribute(tag, 'data-theme-context')).toBe('protected')
  })
})

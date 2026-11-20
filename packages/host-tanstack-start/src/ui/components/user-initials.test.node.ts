import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { initialsFromFullName, initialsFromNames } from './user-initials'

describe('initialsFromNames (admin users: given and family name)', () => {
  test.each([
    ['Ada', 'Lovelace', 'AL'],
    ['ada', 'lovelace', 'AL'],
    ['  Ada ', ' Lovelace', 'AL'],
    ['Émile', 'Ørsted', 'ÉØ'],
    ['Ada', null, 'A'],
    [null, 'Lovelace', 'L'],
    ['', '  ', ''],
    [null, undefined, ''],
    ['E\u0301mile', 'O\u0308rsted', 'ÉÖ'],
    ["'Ada", '-Lovelace', 'AL'],
  ])('%j + %j → %j', (given, family, expected) => {
    expect(initialsFromNames(given, family).normalize('NFC')).toBe(expected)
  })
})

describe('initialsFromFullName (learners: full name only)', () => {
  test.each([
    ['Carol Smith', 'CA'],
    ['carol', 'CA'],
    ['  bo  ', 'BO'],
    ['X', 'X'],
    ['Émile', 'ÉM'],
    ['𝒜lex', '𝒜L'],
    ['', ''],
    ['   ', ''],
    [undefined, ''],
    [null, ''],
    ['J Smith', 'JS'],
    ['E\u0301mile', 'ÉM'],
    ["O'Brien", 'OB'],
    ['- -', ''],
  ])('%j → %j', (fullName, expected) => {
    expect(initialsFromFullName(fullName).normalize('NFC')).toBe(expected)
  })
})

describe('user menus', () => {
  // The kit Avatar always requests a random photo from a third-party host
  // before falling back to initials, which leaks every visit to that host.
  test('no package component renders the kit Avatar', () => {
    const src = resolve(__dirname, '../..')
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? files(path) : [path]
      })
    const offenders = files(src)
      .filter((path) => /\.tsx?$/.test(path) && !/\.test(\.node)?\.tsx?$/.test(path))
      .filter((path) => /<Avatar\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(src, path))
    expect(offenders).toEqual([])
  })
})

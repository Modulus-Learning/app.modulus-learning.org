import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Every peer range must accept the version this repository builds and tests
 * the package with. A dependency upgrade that bumps a development dependency
 * past its peer range would otherwise publish a range that excludes the
 * reference installation, which strict peer resolution then rejects.
 *
 * The ranges use only `*`, `^x.y.z` and `||`, so a small check suffices.
 */

const root = resolve(__dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
}

type Version = [number, number, number]
const parse = (value: string): Version => {
  const [major, minor, patch] = value
    .replace(/^[^\d]*/, '')
    .split(/[.+-]/)
    .map(Number)
  return [major ?? 0, minor ?? 0, patch ?? 0]
}
const compare = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** Caret semantics: changes allowed below the first non-zero component. */
const satisfiesCaret = (version: Version, base: Version) => {
  if (compare(version, base) < 0) return false
  if (base[0] > 0) return version[0] === base[0]
  if (base[1] > 0) return version[0] === 0 && version[1] === base[1]
  return version[0] === 0 && version[1] === 0 && version[2] === base[2]
}

const satisfies = (value: string, range: string): boolean =>
  range.split('||').some((part) => {
    const term = part.trim()
    if (term === '*') return true
    if (term.startsWith('^')) return satisfiesCaret(parse(value), parse(term.slice(1)))
    return compare(parse(value), parse(term)) === 0
  })

describe('the range check itself', () => {
  test.each([
    ['190.0.0', '^188.0.0', false],
    ['190.0.0', '^188.0.0 || ^190.0.0', true],
    ['0.45.2', '^0.45.1', true],
    ['0.46.0', '^0.45.1', false],
    ['3.0.261103-rc', '*', true],
    ['19.3.1', '^19.3.0', true],
  ])('%s in %s → %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected)
  })
})

describe('peer dependency ranges', () => {
  const tested = Object.keys(manifest.peerDependencies).filter(
    (name) => name in manifest.devDependencies
  )

  test.each(tested)('%s accepts the version the package is tested with', (name) => {
    const installed = JSON.parse(
      readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')
    ) as { version: string }
    expect(
      satisfies(installed.version, manifest.peerDependencies[name] ?? ''),
      `${name}@${installed.version} is outside the peer range ${manifest.peerDependencies[name]}`
    ).toBe(true)
  })
})

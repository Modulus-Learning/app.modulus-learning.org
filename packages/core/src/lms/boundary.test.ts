/**
 * The LMS boundary: core depends on the adapter contract in
 * `@modulus-learning/lti` alone. Only tests and test support may import the
 * Canvas adapter package, which is a development dependency of core.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('..', import.meta.url))

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.ts$/.test(name) && !/\.(test|itest)\.ts$/.test(name) ? [path] : []
  })

/** Canvas implementation, reachable only through the installation's adapter. */
const CANVAS_ONLY = [/^@modulus-learning\/lms-canvas(\/|$)/]

/** A specifier as a path relative to `src`, without extension; bare packages pass through. */
const resolveSpecifier = (file: string, specifier: string): string => {
  if (specifier.startsWith('@/')) return specifier.slice(2).replace(/\.js$/, '')
  if (specifier.startsWith('.')) {
    return relative(SRC, join(dirname(file), specifier)).replace(/\.js$/, '')
  }
  return specifier
}

/** Value (non-type-only) imports of a source file. */
const valueImportsOf = (source: string): string[] =>
  [...source.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+'([^']+)'/gm)].map(
    (match) => match[1] ?? ''
  )

const isCanvasOnly = (path: string) => CANVAS_ONLY.some((pattern) => pattern.test(path))

describe('LMS boundary', () => {
  it('keeps the Canvas adapter out of core runtime modules', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const path = relative(SRC, file).replace(/\.ts$/, '')
      if (path.startsWith('test-support/')) continue
      for (const specifier of valueImportsOf(readFileSync(file, 'utf8'))) {
        if (isCanvasOnly(resolveSpecifier(file, specifier))) {
          offenders.push(`${path} → ${specifier}`)
        }
      }
    }
    assert.deepEqual(offenders, [])
  })
})

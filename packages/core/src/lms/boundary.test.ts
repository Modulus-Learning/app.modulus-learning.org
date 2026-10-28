/**
 * The LMS boundary inside core: only the Canvas adapter (and tests) may reach
 * Canvas code. Core's own modules depend on the adapter contract alone, so the
 * Canvas adapter can move into its own package without core changing.
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

/** Modules that are Canvas implementation, reachable only through the adapter. */
const CANVAS_ONLY = [
  /^lms\/canvas(\/|$)/,
  /^modules\/app\/lti\/score-submission\/(ags-client|error-classifier|quota-governor)$/,
]

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
  it('lets only Canvas implementation and test support import Canvas implementation', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const path = relative(SRC, file).replace(/\.ts$/, '')
      if (isCanvasOnly(path) || path.startsWith('test-support/')) continue
      for (const specifier of valueImportsOf(readFileSync(file, 'utf8'))) {
        if (isCanvasOnly(resolveSpecifier(file, specifier))) {
          offenders.push(`${path} → ${specifier}`)
        }
      }
    }
    assert.deepEqual(offenders, [])
  })
})

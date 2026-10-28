import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Shared client components must reach framework primitives only through
 * `@/framework` (spec: Execution Rules → shared components), or the TanStack
 * Start bundle pulls in Next (`next/*`, `react-cookie`, Next server actions).
 * This scans every import style — aliased and relative — in shared UI.
 */

const SRC = resolve(__dirname, '..')

const SHARED_DIRS = ['ui', 'i18n/components', 'context']
const isShared = (path: string) =>
  SHARED_DIRS.some((dir) => path.startsWith(`${dir}/`)) || /^modules\/.+\/components\//.test(path)

/** Next-only modules: the Next host's own implementations, re-exported by `@/framework`. */
const NEXT_BOUND = [
  /^next(\/|$)/,
  /^react-cookie$/,
  /i18n\/components\/lang-link(\.tsx)?$/,
  /i18n\/hooks\/use-lang-navigation(\.ts)?$/,
  /i18n\/hooks\/use-languag-switcher(\.ts)?$/,
  /i18n\/set-language-action(\.ts)?$/,
  /modules\/(app|admin)\/session\/password-auth(\.ts)?$/,
]

/** Shared modules that are themselves the Next half of a split (removed in Task 18). */
const NEXT_HALVES = new Set([
  'i18n/components/lang-link.tsx',
  'i18n/components/available-languages.tsx',
  'ui/theme/provider.tsx',
  'ui/theme/client-theme-detector.tsx',
])

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test(\.node)?\.tsx?$/.test(name) ? [path] : []
  })

describe('shared components stay framework-neutral', () => {
  test('no shared component imports a Next-bound module directly', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const path = relative(SRC, file)
      if (!isShared(path) || NEXT_HALVES.has(path)) continue
      for (const [, specifier] of readFileSync(file, 'utf8').matchAll(
        /^\s*import\s[^;]*?from\s+'([^']+)'/gm
      )) {
        if (NEXT_BOUND.some((pattern) => pattern.test(specifier))) {
          offenders.push(`${path} → ${specifier}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

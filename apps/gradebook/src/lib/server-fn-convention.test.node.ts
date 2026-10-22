import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Convention test for the server-function factories (spec: Data and
 * mutations). A server function that skips its surface gate would be callable
 * on an instance that should not serve it, so "forgot the guard" fails here
 * rather than in review.
 */

const SRC = resolve(__dirname, '..')
const FACTORY_MODULE = 'lib/server-fn.ts'

const ADMIN_FACTORIES = ['adminFn', 'adminSurfaceFn']
const FRONTEND_FACTORIES = ['appFn', 'frontendSurfaceFn']

/** The only modules allowed the session-free admin factory. */
const ADMIN_SURFACE_ALLOWLIST = new Set([
  'modules/admin/session/sign-in.ts',
  'modules/admin/session/renew.ts',
  'modules/admin/session/sign-out.ts',
])

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test(\.node)?\.tsx?$/.test(name) ? [path] : []
  })

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  source: readFileSync(path, 'utf8'),
}))

const importedFactories = (source: string): string[] => {
  const match = source.match(/import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/server-fn['"]/)
  if (match == null) return []
  return match[1]
    .split(',')
    .map((name) => name.trim().split(/\s+as\s+/)[0])
    .filter(Boolean)
}

describe('server-function factory convention', () => {
  test('no bare createServerFn outside the factory module', () => {
    const offenders = files
      .filter(({ path }) => path !== FACTORY_MODULE)
      .filter(({ source }) => /\bcreateServerFn\s*\(/.test(source))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  test('admin modules use only admin factories', () => {
    const offenders = files
      .filter(({ path }) => path.startsWith('modules/admin/'))
      .filter(({ source }) => importedFactories(source).some((f) => FRONTEND_FACTORIES.includes(f)))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  test('learner and LTI modules use only frontend factories', () => {
    const offenders = files
      .filter(({ path }) => /^modules\/(app|lti)\//.test(path))
      .filter(({ source }) => importedFactories(source).some((f) => ADMIN_FACTORIES.includes(f)))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  test('adminSurfaceFn appears only in the admin session allowlist', () => {
    const offenders = files
      .filter(({ path }) => path !== FACTORY_MODULE && !ADMIN_SURFACE_ALLOWLIST.has(path))
      .filter(({ source }) => importedFactories(source).includes('adminSurfaceFn'))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  test('the detector sees factory imports', () => {
    expect(importedFactories("import { appFn, adminFn as a } from '@/lib/server-fn'")).toEqual([
      'appFn',
      'adminFn',
    ])
  })
})

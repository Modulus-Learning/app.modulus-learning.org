import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Convention test for server-function gating (spec: Data and mutations). A
 * server function that skips its surface gate would be callable on an
 * instance that should not serve it, so "forgot the guard" fails here rather
 * than in review.
 *
 * Rule: every `createServerFn(...)` is immediately followed by
 * `.middleware([<gate>, ...])`, where `<gate>` is one of the four gate
 * middlewares exported by `@/lib/server-fn`, and the gate matches the module's
 * surface.
 */

const SRC = resolve(__dirname, '..')

const ADMIN_GATES = ['adminSessionMiddleware', 'adminSurfaceMiddleware']
const FRONTEND_GATES = ['appSessionMiddleware', 'frontendSurfaceMiddleware']
const ALL_GATES = [...ADMIN_GATES, ...FRONTEND_GATES, 'neutralMiddleware']

/** The only modules allowed the surface-neutral gate. */
const NEUTRAL_ALLOWLIST = new Set(['i18n/set-language-fn.ts', 'lib/public-config.ts'])

/** The only modules allowed the session-free admin gate. */
const ADMIN_SURFACE_ALLOWLIST = new Set([
  'modules/admin/session/sign-in.ts',
  'modules/admin/session/renew.ts',
  'modules/admin/session/sign-out.ts',
  // Verification-only snapshot for the admin layouts (no session required to read it).
  'modules/admin/session/session-state.ts',
])

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test(\.node)?\.tsx?$/.test(name) ? [path] : []
  })

/** Drops block and line comments, so documentation that mentions `createServerFn(...)` is not scanned. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  source: stripComments(readFileSync(path, 'utf8')),
}))

/** The first middleware of each `createServerFn(...)` in a source, or null when none follows. */
const serverFnGates = (source: string): Array<string | null> =>
  [...source.matchAll(/\bcreateServerFn\s*\(/g)].map((match) => {
    const rest = source.slice(match.index)
    const gate = rest.match(/^createServerFn\s*\([^)]*\)\s*\.middleware\(\s*\[\s*(\w+)/)
    return gate?.[1] ?? null
  })

const withServerFns = files
  .map((file) => ({ ...file, gates: serverFnGates(file.source) }))
  .filter(({ gates }) => gates.length > 0)

describe('server-function gate convention', () => {
  test('every createServerFn starts with a gate middleware', () => {
    const offenders = withServerFns
      .filter(({ gates }) => gates.some((gate) => gate == null || !ALL_GATES.includes(gate)))
      .map(({ path, gates }) => `${path}: ${gates.join(', ')}`)
    expect(offenders).toEqual([])
  })

  test('admin modules use only admin gates', () => {
    const offenders = withServerFns
      .filter(({ path }) => path.startsWith('modules/admin/'))
      .filter(({ gates }) => gates.some((gate) => gate != null && FRONTEND_GATES.includes(gate)))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  test('learner and LTI modules use only frontend gates', () => {
    const offenders = withServerFns
      .filter(({ path }) => /^modules\/(app|lti)\//.test(path))
      .filter(({ gates }) => gates.some((gate) => gate != null && ADMIN_GATES.includes(gate)))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  test('the session-free admin gate appears only in the admin session allowlist', () => {
    const offenders = withServerFns
      .filter(({ path }) => !ADMIN_SURFACE_ALLOWLIST.has(path))
      .filter(({ gates }) => gates.includes('adminSurfaceMiddleware'))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  test('the surface-neutral gate appears only in its allowlist', () => {
    const offenders = withServerFns
      .filter(({ path }) => !NEUTRAL_ALLOWLIST.has(path))
      .filter(({ gates }) => gates.includes('neutralMiddleware'))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  test('the detector reads gates and reports a missing one', () => {
    expect(
      serverFnGates(
        "createServerFn({ method: 'POST' })\n  .middleware([appSessionMiddleware, other])\n  .handler(x)\n" +
          'createServerFn().handler(y)'
      )
    ).toEqual(['appSessionMiddleware', null])
  })

  test('the renewal functions are found and gated', () => {
    const renewals = withServerFns.filter(({ path }) => path.endsWith('session/renew.ts'))
    expect(renewals.map(({ path, gates }) => [path, gates])).toEqual([
      ['modules/admin/session/renew.ts', ['adminSurfaceMiddleware']],
      ['modules/app/session/renew.ts', ['frontendSurfaceMiddleware']],
    ])
  })
})

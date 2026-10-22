import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Host-override convention (see `vite.config.ts` → `hostOverrides`): in the
 * TanStack Start build every import of `x` resolves to a sibling `x.start.ts(x)`
 * when one exists. An override that lacks a name some shared module imports
 * would build, then fail at runtime, so each override must export every name
 * imported from its original by code outside the Next-only tree (`app/**`).
 */

const SRC = resolve(__dirname, '..')

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test(\.node)?\.tsx?$/.test(name) ? [path] : []
  })

const stripExt = (path: string) => path.replace(/\.(ts|tsx)$/, '')

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  source: readFileSync(path, 'utf8'),
}))

const overrides = files.filter(({ path }) => /\.start\.tsx?$/.test(path))

const exportedNames = (source: string): Set<string> => {
  const names = new Set<string>()
  for (const [, name] of source.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|class|let)\s+(\w+)/gm
  )) {
    names.add(name)
  }
  for (const [, list] of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of list.split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (name) names.add(name)
    }
  }
  return names
}

/** Named value imports from a module key (`modules/app/x`), by importers outside `app/**`. */
const importedNames = (moduleKey: string, exclude: Set<string>): Set<string> => {
  const names = new Set<string>()
  for (const { path, source } of files) {
    if (path.startsWith('app/') || exclude.has(path)) continue
    for (const [, list, specifier] of source.matchAll(
      /^import\s+(?!type\b)\{([^}]*)\}\s+from\s+'([^']+)'/gm
    )) {
      const target = specifier.startsWith('@/')
        ? specifier.slice(2)
        : specifier.startsWith('.')
          ? normalize(join(dirname(path), specifier))
          : null
      if (target == null || stripExt(target) !== moduleKey) continue
      for (const part of list.split(',')) {
        const name = part.trim()
        if (name && !name.startsWith('type ')) names.add(name.split(/\s+as\s+/)[0].trim())
      }
    }
  }
  return names
}

describe('host-override convention', () => {
  test('there are overrides to check', () => {
    expect(overrides.length).toBeGreaterThan(0)
  })

  test.each(overrides.map(({ path }) => path))('%s exports what shared code imports', (path) => {
    const override = files.find((file) => file.path === path)
    const moduleKey = path.replace(/\.start\.tsx?$/, '')
    const original = files.find((file) => stripExt(file.path) === moduleKey)
    expect(original, `${path} has no original module`).toBeDefined()

    const required = importedNames(moduleKey, new Set([path, original?.path ?? '']))
    const provided = exportedNames(override?.source ?? '')
    expect([...required].filter((name) => !provided.has(name))).toEqual([])
  })
})

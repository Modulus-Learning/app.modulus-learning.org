import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'

import postcss, { type AtRule, type Declaration, type Rule } from 'postcss'
import { describe, expect, test } from 'vitest'

import { MODULUS_LAYER_ORDER } from './css-layers'

/**
 * Source guard for the CSS layer contract: a Tailwind utility applied directly
 * to an element overrides ordinary package declarations for the same property
 * on that element. That holds only while every package declaration sits in a
 * cascade layer below `utilities`, so this fails on unlayered declarations,
 * `!important`, layers the package does not own, `@scope` roots that cannot
 * match, and styles that React renders outside the stylesheets.
 */

const SRC = resolve(__dirname)
const require = createRequire(import.meta.url)
const PACKAGE_LAYERS = ['modulus-theme', 'modulus-base', 'modulus-components']
const THEME_SELECTORS = [
  ':root',
  ':root[data-chrome="chromeless"]',
  '.dark',
  '[data-theme="dark"]',
  '[data-theme="dark"] ::backdrop',
  '.not-dark',
]

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'fixtures' || name === 'node_modules') return []
    return statSync(path).isDirectory() ? files(path) : [path]
  })
const all = files(SRC)
const sheets = all.filter((path) => path.endsWith('.css'))
const sources = all.filter(
  (path) => /\.tsx?$/.test(path) && !/\.test(\.node)?\.tsx?$/.test(path) && !path.endsWith('.d.ts')
)
const read = (path: string) => readFileSync(path, 'utf8')
const where = (path: string, line?: number) => `${relative(SRC, path)}:${line ?? 0}`

const layerOf = (node: Declaration | Rule | AtRule) => {
  const layers: string[] = []
  for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent)
    if (parent.type === 'atrule' && (parent as AtRule).name === 'layer')
      layers.unshift((parent as AtRule).params.trim())
  return layers.join('.')
}

/** Declarations that are neither layered nor descriptors, and any `!important`. */
function auditCss(css: string) {
  const issues: Array<{ line: number; property: string; kind: 'unlayered' | 'important' }> = []
  const inspect = (node: Declaration | AtRule, property: string, important: boolean) => {
    let layered = false
    let descriptor = false
    for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type !== 'atrule') continue
      const { name, params } = parent as AtRule
      if (name === 'layer' && params.trim()) layered = true
      if (/^(?:font-face|property|counter-style|font-feature-values|theme|utility)$/.test(name))
        descriptor = true
      if (/(?:^|-)keyframes$/.test(name)) descriptor = true
    }
    const line = node.source?.start?.line ?? 0
    if (!layered && !descriptor) issues.push({ line, property, kind: 'unlayered' })
    if (important) issues.push({ line, property, kind: 'important' })
  }
  const root = postcss.parse(css)
  root.walkDecls((decl) => inspect(decl, decl.prop, decl.important === true))
  root.walkAtRules('apply', (rule) => inspect(rule, '@apply', /!important\b/.test(rule.params)))
  return issues
}

/**
 * Inside `@scope`, a selector without `:scope` or `&` matches below the
 * scoping root, so one that starts at the root element never matches. Scopes
 * rooted at `<html>` (which also carries `.dark`) must use `:scope`,
 * `:scope.dark` or `:is(.dark *)` instead of `:root`, `html` or `.dark`.
 */
function auditScopeRoots(css: string) {
  const issues: Array<{ line: number; selector: string }> = []
  postcss.parse(css).walkRules((rule) => {
    let scoped = false
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'rule') return
      if (parent.type === 'atrule' && (parent as AtRule).name === 'scope') scoped = true
    }
    if (!scoped) return
    for (const selector of rule.selectors) {
      if (/:scope\b|&/.test(selector)) continue
      let outer = selector
      while (/\([^()]*\)/.test(outer)) outer = outer.replace(/\([^()]*\)/g, '')
      if (/^(?:html|:root)(?![\w-])|\.dark(?![\w-])/.test(outer.trim()))
        issues.push({ line: rule.source?.start?.line ?? 0, selector })
    }
  })
  return issues
}

const normalise = (value: string) => value.replace(/\s/g, '').replace(/;$/, '')

describe('package stylesheets', () => {
  test('exist', () => {
    expect(sheets.length).toBeGreaterThan(30)
  })

  test('each opens with the full Modulus layer order', () => {
    const missing = sheets.filter((path) => {
      const first = postcss.parse(read(path)).nodes.find((node) => node.type !== 'comment')
      return !(
        first?.type === 'atrule' &&
        first.name === 'layer' &&
        !first.nodes &&
        normalise(`@layer ${first.params}`) === normalise(MODULUS_LAYER_ORDER)
      )
    })
    expect(missing.map((path) => relative(SRC, path))).toEqual([])
  })

  test('keep every declaration layered and never important', () => {
    const issues = sheets.flatMap((path) =>
      auditCss(read(path)).map(
        (issue) => `${where(path, issue.line)} ${issue.kind} ${issue.property}`
      )
    )
    expect(issues).toEqual([])
  })

  test('use only the modulus layers', () => {
    const issues: string[] = []
    for (const path of sheets)
      postcss.parse(read(path)).walkAtRules('layer', (rule) => {
        if (rule.nodes && !PACKAGE_LAYERS.includes(rule.params.trim()))
          issues.push(`${where(path, rule.source?.start?.line)} ${rule.params}`)
      })
    expect(issues).toEqual([])
  })

  test('keep only root-level tokens in modulus-theme', () => {
    const issues: string[] = []
    for (const path of sheets)
      postcss.parse(read(path)).walkDecls((decl) => {
        if (layerOf(decl) !== 'modulus-theme') return
        const rule = decl.parent as Rule
        const nested = rule.parent?.type === 'rule'
        const allowed =
          decl.prop.startsWith('--') &&
          rule.type === 'rule' &&
          !nested &&
          rule.selectors.every((selector) => THEME_SELECTORS.includes(selector.trim()))
        if (!allowed) issues.push(`${where(path, decl.source?.start?.line)} ${decl.prop}`)
      })
    expect(issues).toEqual([])
  })

  test('set no custom property that the kit sets in a higher layer', () => {
    // A Modulus token placed below the kit layer that also sets it silently
    // loses: the kit defines intent tokens (--fill-primary-*, …) in
    // infonomic-functional, above modulus-theme.
    const order = MODULUS_LAYER_ORDER.replace(/^@layer\s+/, '')
      .replace(/;$/, '')
      .split(',')
      .map((name) => name.trim())
    const kitStyles = dirname(require.resolve('@infonomic/uikit/reset.css'))
    const kit = new Map<string, number>()
    for (const name of ['reset.css', 'styles.css', 'typography.css'])
      postcss.parse(read(resolve(kitStyles, name))).walkDecls((decl) => {
        if (!decl.prop.startsWith('--')) return
        const rank = order.indexOf(layerOf(decl).split('.')[0])
        kit.set(decl.prop, Math.max(rank, kit.get(decl.prop) ?? -1))
      })
    const issues: string[] = []
    for (const path of sheets)
      postcss.parse(read(path)).walkDecls((decl) => {
        const layer = layerOf(decl)
        if (!decl.prop.startsWith('--') || !PACKAGE_LAYERS.includes(layer)) return
        const kitRank = kit.get(decl.prop) ?? -1
        if (kitRank > order.indexOf(layer))
          issues.push(
            `${where(path, decl.source?.start?.line)} ${decl.prop} (${layer} < ${order[kitRank]})`
          )
      })
    expect(issues).toEqual([])
  })

  test('use @scope roots that can match', () => {
    const issues = sheets.flatMap((path) =>
      auditScopeRoots(read(path)).map((issue) => `${where(path, issue.line)} ${issue.selector}`)
    )
    expect(issues).toEqual([])
  })

  test('keep .not-dark after the dark token block, so it wins on equal specificity', () => {
    const nodes = postcss.parse(read(resolve(SRC, 'ui/styles/theme.css')))
    const order: string[] = []
    nodes.walkRules((rule) => {
      order.push(rule.selector.replace(/\s+/g, ' '))
    })
    const dark = order.findIndex((selector) => selector.startsWith('.dark'))
    const notDark = order.indexOf('.not-dark')
    expect(dark).toBeGreaterThanOrEqual(0)
    expect(notDark).toBeGreaterThan(dark)
  })
})

describe('the page background', () => {
  // A utility on <body> would beat any installation `body { background }`, so
  // the background is a token an installation sets on its public scope root.
  const rootRoute = read(resolve(SRC, 'routes/__root.route.tsx'))

  test('is not set by utilities on <body>, and <html> carries the chrome', () => {
    const body = rootRoute.match(/<body\b[^>]*>/s)?.[0] ?? ''
    expect(body).not.toMatch(/\bbg-/)
    expect(rootRoute).toContain('data-chrome={chrome}')
  })

  test('is a --page-background token for light, dark and chromeless', () => {
    const values = new Map<string, string>()
    postcss
      .parse(read(resolve(SRC, 'ui/styles/theme.css')))
      .walkDecls('--page-background', (decl) => {
        expect(layerOf(decl)).toBe('modulus-theme')
        values.set((decl.parent as Rule).selector.replace(/\s+/g, ' '), decl.value)
      })
    expect(values.get(':root')).toBe('white')
    expect(values.get('.dark, [data-theme="dark"]')).toBe('var(--canvas-900)')
    expect(values.get(':root[data-chrome="chromeless"]')).toBe('var(--gray-50)')
  })

  test('is applied to body in modulus-base', () => {
    let applied = false
    postcss.parse(read(resolve(SRC, 'ui/styles/app.css'))).walkDecls('background-color', (decl) => {
      if (
        (decl.parent as Rule).selector === 'body' &&
        decl.value === 'var(--page-background)' &&
        layerOf(decl) === 'modulus-base'
      )
        applied = true
    })
    expect(applied).toBe(true)
  })
})

describe('the stylesheet entry (owned by the installation)', () => {
  const styles = (name: string) => read(resolve(SRC, 'ui/styles', name))
  const imports = (css: string) => {
    const found: string[] = []
    postcss.parse(css).walkAtRules('import', (rule) => {
      found.push(rule.params.replace(/\s+/g, ' '))
    })
    return found
  }

  test('the root route imports no CSS', () => {
    expect(read(resolve(SRC, 'routes/__root.route.tsx'))).not.toMatch(
      /import\s+['"][^'"]+\.css['"]/
    )
  })

  test('the Tailwind part is the whole Tailwind contract minus the compiler imports', () => {
    const css = styles('tailwind.css')
    expect(css).toMatch(/@source\s+"\.\.\/\.\.\/";/)
    expect(css).toContain('@custom-variant dark (&:is(.dark *));')
    expect(css).toMatch(/@utility container\s*\{/)
    expect(css).toMatch(/@theme\s*\{/)
    expect(imports(css)).toEqual([])
  })

  test('modulus.css holds the kit and Modulus CSS without Tailwind', () => {
    expect(imports(styles('modulus.css'))).toEqual([
      '"@infonomic/uikit/reset.css"',
      '"@infonomic/uikit/styles.css"',
      '"@infonomic/uikit/typography.css"',
      '"./theme.css"',
      '"./app.css"',
    ])
  })

  test('the default entry composes both, with Tailwind in its own layers', () => {
    expect(imports(styles('global.css'))).toEqual([
      '"./modulus.css"',
      '"tailwindcss/theme.css" layer(theme)',
      '"tailwindcss/utilities.css" layer(utilities)',
      '"./tailwind.css"',
    ])
  })
})

describe('the scope-root audit', () => {
  test('reports selectors that start at the scoping root', () => {
    const css =
      '@layer overrides { @scope (:root[data-theme-context="public"]) { :root { --x: 1 } .dark .y { color: red } } }'
    expect(auditScopeRoots(css)).toHaveLength(2)
  })

  test('accepts :scope and :is(.dark *)', () => {
    const css =
      '@layer overrides { @scope (:root[data-theme-context="public"]) { :scope { --x: 1 } .y:is(.dark *) { color: red } } }'
    expect(auditScopeRoots(css)).toEqual([])
  })
})

describe('package components', () => {
  test('render no style elements other than the layer order statement', () => {
    const issues = sources.flatMap((path) =>
      [...read(path).matchAll(/<style\b[^>]*>(.*?)<\/style>/gs)]
        .filter((match) => match[0] !== '<style>{MODULUS_LAYER_ORDER}</style>')
        .map(() => relative(SRC, path))
    )
    expect(issues).toEqual([])
  })

  test('declare nothing important', () => {
    const issues = sources.flatMap((path) =>
      read(path)
        .split('\n')
        .filter((line) => /!important/.test(line) && !/^\s*(?:\/\/|\*|\/\*)/.test(line))
        .map((line) => `${relative(SRC, path)}: ${line.trim()}`)
    )
    expect(issues).toEqual([])
  })
})

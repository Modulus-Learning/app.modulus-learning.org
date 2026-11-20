import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { INFONOMIC_LAYER_ORDER } from '@infonomic/uikit/css-layers'
import postcss from 'postcss'
import type { Plugin as VitePlugin } from 'vite'
import { describe, expect, test } from 'vitest'

import { MODULUS_LAYER_ORDER, modulusLayerOrder } from './css-layers'
import { modulus } from './vite/index'

const names = (statement: string) =>
  statement
    .replace(/^@layer\s+/, '')
    .replace(/;$/, '')
    .split(',')
    .map((name) => name.trim())

/** Layer names in the order they first appear across top-level `@layer` at-rules. */
const firstLayerOrder = (css: string) => {
  const seen: string[] = []
  for (const node of postcss.parse(css).nodes) {
    if (node.type !== 'atrule' || node.name !== 'layer') continue
    for (const name of node.params.split(',').map((value) => value.trim()))
      if (!seen.includes(name)) seen.push(name)
  }
  return seen
}

describe('the Modulus layer order', () => {
  test('is a superset of the kit order with the same relative order', () => {
    const kit = names(INFONOMIC_LAYER_ORDER)
    expect(names(MODULUS_LAYER_ORDER).filter((name) => kit.includes(name))).toEqual(kit)
  })

  test("ranks Tailwind's properties layer lowest, as Tailwind's own output does", () => {
    // Tailwind emits `@layer properties;` ahead of its output, holding `--tw-*`
    // initial values on `*` for browsers without @property. Declared after
    // `utilities`, it would cancel transform, ring and shadow utilities there.
    expect(names(MODULUS_LAYER_ORDER)[0]).toBe('properties')
  })

  test('puts package layers directly above the kit layer they extend and below overrides', () => {
    const order = names(MODULUS_LAYER_ORDER)
    expect(order.indexOf('modulus-theme')).toBe(order.indexOf('infonomic-theme') + 1)
    expect(order.indexOf('modulus-base')).toBe(order.indexOf('infonomic-typography') + 1)
    expect(order.indexOf('modulus-components')).toBe(order.indexOf('infonomic-components') + 1)
    expect(order.indexOf('overrides')).toBeGreaterThan(order.indexOf('modulus-components'))
    expect(order.at(-1)).toBe('utilities')
  })
})

describe('the layer order PostCSS plugin', () => {
  test.each([
    '@import "host.css"; .host { color: red }',
    '@layer base, infonomic-base, theme, infonomic-theme, infonomic-functional; @layer infonomic-typography { :root { --x: 1 } }',
    '@layer utilities, overrides; @layer overrides { .brand { color: red } }',
  ])('reserves the full order first, idempotently: %s', async (css) => {
    const once = (await postcss([modulusLayerOrder()]).process(css, { from: undefined })).css
    expect(firstLayerOrder(once)).toEqual(names(MODULUS_LAYER_ORDER))
    const twice = (await postcss([modulusLayerOrder()]).process(once, { from: undefined })).css
    expect(firstLayerOrder(twice)).toEqual(names(MODULUS_LAYER_ORDER))
  })
})

describe('host integration', () => {
  test('the Vite preset registers the plugin inline', () => {
    const plugin: VitePlugin = modulus()
    const config = (plugin.config as () => { css?: { postcss?: { plugins?: unknown[] } } })()
    const plugins = (config.css?.postcss?.plugins ?? []) as Array<{ postcssPlugin?: string }>
    expect(plugins.map((p) => p.postcssPlugin)).toContain('modulus-layer-order')
  })

  test('the root document renders the statement as the first head element', () => {
    const source = readFileSync(resolve(__dirname, 'routes/__root.route.tsx'), 'utf8')
    expect(source).toMatch(/<head>\s*<style>\{MODULUS_LAYER_ORDER\}<\/style>/)
  })
})

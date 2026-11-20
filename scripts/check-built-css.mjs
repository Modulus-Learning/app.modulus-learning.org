#!/usr/bin/env node
// Check a host's built client CSS against the Modulus CSS layer contract:
//
// - every stylesheet establishes the full Modulus layer order first, so a
//   chunk that reaches the browser first (kit-only chunks included) cannot fix
//   a partial order;
// - Tailwind scanned the package: a utility used only in package code is
//   generated (`group-last:hidden`, from the registration stepper; not
//   `flex-1`, which the gradebook uses itself);
// - CSS a packaged component imports is present (`.gradient-glow`);
// - the class-based dark variant is in use;
// - the package's custom `container` utility, not only Tailwind's or the
//   kit's, sets the effective widths at each breakpoint.
//
// Usage: node scripts/check-built-css.mjs <directory of built .css files>
// Expects packages/host-tanstack-start to be built.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: check-built-css.mjs <css directory>')
  process.exit(2)
}

const host = new URL('../packages/host-tanstack-start/', import.meta.url)
const postcss = createRequire(new URL('package.json', host))('postcss')
const { MODULUS_LAYER_ORDER } = await import(new URL('dist/css-layers.js', host))

const expected = MODULUS_LAYER_ORDER.replace(/^@layer\s+/, '')
  .replace(/;$/, '')
  .split(',')
  .map((name) => name.trim())

const sheets = readdirSync(dir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => ({ name, css: readFileSync(join(dir, name), 'utf8') }))
const failures = []
if (sheets.length === 0) failures.push(`no .css files in ${dir}`)

// Minifiers fold the prelude into layer blocks, so compare first appearances.
for (const { name, css } of sheets) {
  const names = []
  for (const match of css.matchAll(/@layer\s+([^{;]+)[{;]/g))
    for (const layer of match[1].split(',').map((value) => value.trim()))
      if (!names.includes(layer)) names.push(layer)
  if (expected.some((layer, index) => names[index] !== layer))
    failures.push(`${name}: layer order starts ${names.slice(0, expected.length).join(', ')}`)
}

const all = sheets.map((sheet) => sheet.css).join('\n')
const present = [
  ['package-only utility group-last:hidden', /\.group-last\\:hidden\b/],
  ['packaged component CSS .gradient-glow', /\.gradient-glow\b/],
  ['class-based dark variant :is(.dark *)', /:is\(\s*\.dark\s+\*\s*\)/],
]
for (const [label, pattern] of present) if (!pattern.test(all)) failures.push(`missing ${label}`)

// The effective container max-width is the last applicable `.container` rule in
// the utilities layer, in source order, at a given viewport width (rem).
const containerRules = []
for (const { css } of sheets)
  postcss.parse(css).walkDecls('max-width', (decl) => {
    const rule = decl.parent
    if (rule.type !== 'rule' || !rule.selectors.some((s) => s.trim() === '.container')) return
    let layered = false
    let min = 0
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type !== 'atrule') continue
      if (parent.name === 'layer' && parent.params.trim() === 'utilities') layered = true
      if (parent.name === 'media') {
        const width = parent.params.match(/(?:min-width:\s*|width\s*>=\s*)([\d.]+)rem/)
        if (!width) return
        min = Number(width[1])
      }
    }
    if (layered) containerRules.push({ min, value: decl.value })
  })
const effective = (rem) =>
  containerRules.filter((rule) => rule.min <= rem).at(-1)?.value ?? '(none)'
for (const [rem, want] of [
  [20, '60rem'],
  [50, '60rem'],
  [70, '64rem'],
  [80, '74.375rem'],
  [100, '87.5rem'],
]) {
  const got = effective(rem)
  if (got !== want) failures.push(`container at ${rem}rem: max-width ${got}, expected ${want}`)
}

if (failures.length > 0) {
  console.error(`built CSS check failed for ${dir}:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`built CSS check passed: ${sheets.length} stylesheets in ${dir}`)

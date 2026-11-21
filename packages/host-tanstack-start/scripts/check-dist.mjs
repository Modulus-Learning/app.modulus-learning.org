// Finish dist after tsc and tsc-alias. tsc-alias rewrites `@/` in module
// imports, but not in type-level `import("@/…")` expressions in declaration
// files (emitted where inferred types reference other modules), so rewrite
// those to relative paths here. Then fail if any `@/` specifier survives
// (asset imports — SVG, CSS, JSON — must be written as relative paths in
// source), or if a relative import names no file.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })

const all = files(dist)

for (const file of all.filter((path) => path.endsWith('.d.ts'))) {
  const source = readFileSync(file, 'utf8')
  const rewritten = source.replace(/import\("@\/([^"]+)"\)/g, (_, target) => {
    let path = relative(dirname(file), join(dist, target))
    if (!path.startsWith('.')) path = `./${path}`
    return `import("${path}")`
  })
  if (rewritten !== source) writeFileSync(file, rewritten)
}

const offenders = all
  .filter((path) => path.endsWith('.js') || path.endsWith('.d.ts'))
  .filter((path) => /from ['"]@\/|import\(['"]@\//.test(readFileSync(path, 'utf8')))
if (offenders.length > 0) {
  console.error(
    `unresolved @/ specifiers in dist (use relative paths for assets):\n${offenders.join('\n')}`
  )
  process.exit(1)
}

// The module specifiers a built file imports or re-exports, ignoring commented
// code and dropping Vite query suffixes such as `?raw`.
const specifiers = (source) =>
  [
    ...source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .matchAll(
        /(?:^|[\s;])(?:import|export)\s*(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm
      ),
  ].map((match) => (match[1] ?? match[2]).replace(/\?.*$/, ''))

// Every relative import in dist must name a file that exists. A module that
// imports a missing asset builds with tsc but breaks any host that loads it
// (Modulus-Learning/app.modulus-learning.org#17). Module imports are emitted
// without extensions and resolved by the host's bundler, so try those too.
const resolves = (path) =>
  [path, `${path}.js`, join(path, 'index.js')].some(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile()
  )
const missing = all
  .filter((path) => path.endsWith('.js'))
  .flatMap((file) =>
    specifiers(readFileSync(file, 'utf8'))
      .filter((specifier) => specifier.startsWith('.'))
      .filter((specifier) => !resolves(join(dirname(file), specifier)))
      .map((specifier) => `${relative(dist, file)}: ${specifier}`)
  )
if (missing.length > 0) {
  console.error(`relative imports in dist that resolve to no file:\n${missing.join('\n')}`)
  process.exit(1)
}

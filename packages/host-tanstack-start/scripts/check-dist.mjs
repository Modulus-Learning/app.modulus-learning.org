// Finish dist after tsc and tsc-alias. tsc-alias rewrites `@/` in module
// imports, but not in type-level `import("@/…")` expressions in declaration
// files (emitted where inferred types reference other modules), so rewrite
// those to relative paths here. Then fail if any `@/` specifier survives
// (asset imports — SVG, CSS, JSON — must be written as relative paths in
// source), if a relative import names no file, or if browser code imports a
// third-party module the modulus() Vite preset does not pre-bundle.
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

// Every third-party module imported by browser code must be pre-bundled by the
// modulus() Vite preset, or installations fail in dev when CommonJS sits
// beneath it (Modulus-Learning/app.modulus-learning.org#16). Browser code is
// everything under these directories apart from `*.server.js` modules.
// Packages an installation depends on directly are pre-bundled by its own
// Vite config and are not listed in the preset.
const { hostClientDependencies } = await import(join(dist, 'vite/index.js'))
const installationDependency =
  /^(react|react-dom|lucide-react)(\/|$)|^@(tanstack|modulus-learning)\/|^@infonomic\/uikit(\/|$)/
const browserDirs = ['ui', 'modules', 'context', 'routes'].map((dir) => join(dist, dir))
const unbundled = new Map()
for (const file of all) {
  if (!file.endsWith('.js') || file.endsWith('.server.js')) continue
  if (!browserDirs.some((dir) => file.startsWith(`${dir}/`))) continue
  for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
    if (specifier.startsWith('.') || specifier.startsWith('node:')) continue
    if (installationDependency.test(specifier) || hostClientDependencies.includes(specifier)) {
      continue
    }
    unbundled.set(specifier, relative(dist, file))
  }
}
if (unbundled.size > 0) {
  const list = [...unbundled].map(([specifier, file]) => `${specifier} (${file})`).join('\n')
  console.error(
    `browser imports missing from hostClientDependencies in src/vite/index.ts:\n${list}`
  )
  process.exit(1)
}

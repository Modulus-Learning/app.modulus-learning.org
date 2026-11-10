// Finish dist after tsc and tsc-alias. tsc-alias rewrites `@/` in module
// imports, but not in type-level `import("@/…")` expressions in declaration
// files (emitted where inferred types reference other modules), so rewrite
// those to relative paths here. Then fail if any `@/` specifier survives:
// asset imports (SVG, CSS, JSON) must be written as relative paths in source.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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

// Fail the build if any `@/` specifier survived into dist. tsc-alias rewrites
// TypeScript module imports, but not imports of assets (SVG, CSS, JSON), which
// must therefore be written as relative paths in source.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.js') ? [path] : []
  })

const offenders = files(dist).filter((file) =>
  /from ['"]@\/|import\(['"]@\//.test(readFileSync(file, 'utf8'))
)
if (offenders.length > 0) {
  console.error(
    `unresolved @/ imports in dist (use relative paths for assets):\n${offenders.join('\n')}`
  )
  process.exit(1)
}

// Copy the non-TypeScript files that packaged modules import (stylesheets,
// images, translation JSON) into dist, beside the compiled modules.
import { cpSync } from 'node:fs'

const from = new URL('../src/', import.meta.url)
const to = new URL('../dist/', import.meta.url)

cpSync(from, to, {
  recursive: true,
  // Test fixtures stay in the repository.
  filter: (source) =>
    !/\/fixtures(\/|$)/.test(source) && (!/\.(ts|tsx)$/.test(source) || source.endsWith('.d.ts')),
})

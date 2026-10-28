// Copy the shipped SQL (the baseline and release scripts only) into dist.
// pg_dump snapshots and maintenance scripts in the same directory never ship.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'

const from = new URL('../src/database/sql/', import.meta.url)
const to = new URL('../dist/database/sql/', import.meta.url)
const shipped = /^(baseline|\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+)\.sql$/

mkdirSync(to, { recursive: true })
for (const name of readdirSync(from).filter((name) => shipped.test(name))) {
  copyFileSync(new URL(name, from), new URL(name, to))
}

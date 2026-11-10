import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { RELEASE_SCRIPT_PATTERN, type ScriptRecord } from './compare.js'

/**
 * The SQL directory beside this module's parent: `src/database/sql` when run
 * from source, `dist/database/sql` (copied at build) when run from the package.
 */
export const SQL_DIRECTORY = fileURLToPath(new URL('../sql/', import.meta.url))

export type ScriptFile = ScriptRecord & { sql: string }

export const checksumOf = (sql: string): string => createHash('sha256').update(sql).digest('hex')

/** The release scripts in `directory`, in apply order. */
export const readReleaseScripts = (directory = SQL_DIRECTORY): ScriptFile[] =>
  readdirSync(directory)
    .filter((name) => RELEASE_SCRIPT_PATTERN.test(name))
    .sort()
    .map((name) => {
      const sql = readFileSync(`${directory}${name}`, 'utf8')
      return { name, sql, checksum: checksumOf(sql) }
    })

export const readBaseline = (directory = SQL_DIRECTORY): string =>
  readFileSync(`${directory}baseline.sql`, 'utf8')

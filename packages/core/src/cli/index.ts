#!/usr/bin/env node
/**
 * `modulus` — operational commands for a Modulus installation.
 *
 *   modulus db status                  applied, pending and unknown release scripts
 *   modulus db init                    empty database only: apply the baseline and bootstrap
 *   modulus db upgrade                 apply unapplied release scripts in order
 *   modulus db adopt --through <name>  start the ledger for a hand-maintained schema
 *   modulus bootstrap                  create missing reference roles and permissions
 *   modulus admin create --email <a>   create an administrator with the Manager role
 *   modulus keys generate              print a fresh set of installation keys
 *
 * Database commands connect with --database-url or POSTGRES_CONNECTION_STRING,
 * optionally loaded with --env-file.
 */
import { parseArgs } from 'node:util'

import { runAdmin, runBootstrap } from './admin.js'
import { runDb } from './db.js'
import { runKeys } from './keys.js'

const USAGE = `usage:
  modulus db status|init|upgrade      [--database-url <url>] [--env-file <path>]
  modulus db adopt --through <script> [--database-url <url>] [--env-file <path>]
  modulus bootstrap                   [--database-url <url>] [--env-file <path>]
  modulus admin create --email <address> [--given-name <name>] [--family-name <name>]
                       [--password-stdin] [--database-url <url>] [--env-file <path>]
  modulus keys generate`

const main = async (): Promise<number> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      'database-url': { type: 'string' },
      'env-file': { type: 'string' },
      through: { type: 'string' },
      email: { type: 'string' },
      'given-name': { type: 'string' },
      'family-name': { type: 'string' },
      'password-stdin': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [group, command] = positionals

  let code = 2
  if (!values.help) {
    if (group === 'db') code = await runDb(command, values)
    else if (group === 'bootstrap') code = await runBootstrap(values)
    else if (group === 'admin') code = await runAdmin(command, values)
    else if (group === 'keys') code = runKeys(command)
  }
  if (code === 2 || values.help) console.log(USAGE)
  return values.help ? 0 : code
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
)

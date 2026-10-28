#!/usr/bin/env node
/**
 * `modulus` — database commands for a Modulus installation.
 *
 *   modulus db status                  applied, pending and unknown release scripts
 *   modulus db init                    empty database only: apply the baseline
 *   modulus db upgrade                 apply unapplied release scripts in order
 *   modulus db adopt --through <name>  start the ledger for a hand-maintained schema
 *
 * The connection comes from --database-url or POSTGRES_CONNECTION_STRING,
 * optionally loaded with --env-file.
 */
import { parseArgs } from 'node:util'

import {
  adoptSchema,
  initSchema,
  loadShippedScripts,
  schemaStatus,
  upgradeSchema,
} from '../database/schema-scripts/commands.js'
import { describeSchemaState } from '../database/schema-scripts/compare.js'
import { openClient } from '../database/schema-scripts/ledger.js'

const USAGE = `usage: modulus db <status|init|upgrade|adopt --through <script>>
         [--database-url <url>] [--env-file <path>]`

const main = async (): Promise<number> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      'database-url': { type: 'string' },
      'env-file': { type: 'string' },
      through: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [group, command] = positionals
  if (values.help || group !== 'db' || command == null) {
    console.log(USAGE)
    return values.help ? 0 : 2
  }

  if (values['env-file'] != null) process.loadEnvFile(values['env-file'])
  const connectionString = values['database-url'] ?? process.env.POSTGRES_CONNECTION_STRING
  if (connectionString == null) {
    console.error('no database: pass --database-url or set POSTGRES_CONNECTION_STRING')
    return 2
  }

  const scripts = loadShippedScripts()
  const client = await openClient(connectionString)
  try {
    switch (command) {
      case 'status': {
        const state = await schemaStatus(client, scripts)
        console.log(describeSchemaState(state))
        return state.status === 'ok' ? 0 : 1
      }
      case 'init':
        await initSchema(client, scripts)
        console.log(`initialised the schema at ${scripts.at(-1)?.name ?? 'baseline'}`)
        return 0
      case 'upgrade': {
        const applied = await upgradeSchema(client, scripts, console.log)
        console.log(
          applied.length === 0 ? 'schema is current' : `applied ${applied.length} script(s)`
        )
        return 0
      }
      case 'adopt': {
        if (values.through == null) {
          console.error('adopt requires --through <script>')
          return 2
        }
        const adopted = await adoptSchema(client, scripts, values.through)
        console.log(`recorded ${adopted.length} script(s) as applied`)
        return 0
      }
      default:
        console.log(USAGE)
        return 2
    }
  } finally {
    await client.end()
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
)

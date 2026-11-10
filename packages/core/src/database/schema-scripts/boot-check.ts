import type { Logger } from 'pino'

import { compareLedger, describeSchemaState } from './compare.js'
import { hasModulusTables, openClient, readLedger } from './ledger.js'
import { RELEASE_SCRIPTS } from './manifest.gen.js'

export type SchemaCheckMode = 'enforce' | 'warn' | 'off'

export type SchemaCheckOptions = {
  connectionString: string
  mode: SchemaCheckMode
  allowNewer: boolean
  logger: Logger
}

/**
 * Compare the database's script ledger with the scripts this build shipped.
 * In `enforce` mode an unexpected state throws, so the process refuses to
 * start; in `warn` mode (development and tests, whose databases Drizzle
 * builds) it only logs.
 */
export const checkSchema = async ({
  connectionString,
  mode,
  allowNewer,
  logger,
}: SchemaCheckOptions): Promise<void> => {
  if (mode === 'off') return

  let message: string | undefined
  try {
    const client = await openClient(connectionString)
    try {
      const state = compareLedger(
        RELEASE_SCRIPTS,
        await readLedger(client),
        await hasModulusTables(client)
      )
      if (state.status === 'ok') return
      if (state.status === 'newer' && allowNewer) {
        logger.warn({ scripts: state.scripts }, 'schema check: running against a newer schema')
        return
      }
      message = `schema check: ${describeSchemaState(state)}`
    } finally {
      await client.end()
    }
  } catch (error) {
    message = `schema check failed: ${error instanceof Error ? error.message : String(error)}`
  }

  if (mode === 'enforce') throw new Error(message)
  logger.warn(message)
}

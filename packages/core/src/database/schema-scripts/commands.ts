import {
  compareLedger,
  describeSchemaState,
  type SchemaState,
  type ScriptRecord,
} from './compare.js'
import { readBaseline, readReleaseScripts, type ScriptFile } from './files.js'
import {
  type Client,
  createLedger,
  hasModulusTables,
  readLedger,
  recordScripts,
  withSchemaLock,
} from './ledger.js'
import { RELEASE_SCRIPTS } from './manifest.gen.js'

/**
 * The operations behind `modulus db`. Each takes a connected client and the
 * shipped scripts, and refuses a database it does not expect rather than
 * guessing.
 */

const records = (scripts: readonly ScriptFile[]): ScriptRecord[] =>
  scripts.map(({ name, checksum }) => ({ name, checksum }))

/** The shipped files must be exactly the scripts this build was generated with. */
export const loadShippedScripts = (): ScriptFile[] => {
  const scripts = readReleaseScripts()
  const state = compareLedger(RELEASE_SCRIPTS, records(scripts))
  if (state.status !== 'ok') {
    throw new Error(
      `shipped SQL files do not match the build manifest: ${describeSchemaState(state)}`
    )
  }
  return scripts
}

export const schemaStatus = async (
  client: Client,
  scripts: readonly ScriptFile[]
): Promise<SchemaState> =>
  compareLedger(records(scripts), await readLedger(client), await hasModulusTables(client))

/** Apply the baseline to an empty database and record every shipped script. */
export const initSchema = async (client: Client, scripts: readonly ScriptFile[]): Promise<void> =>
  withSchemaLock(client, async () => {
    if ((await readLedger(client)) != null || (await hasModulusTables(client))) {
      throw new Error('refusing to initialise: the database already has a Modulus schema')
    }
    await client.query('BEGIN')
    try {
      await client.query(readBaseline())
      await createLedger(client)
      await recordScripts(client, records(scripts))
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })

/**
 * Apply unapplied release scripts in name order. Each script manages its own
 * transaction and is safe to re-run, so a failure between a script and its
 * ledger row only means the script runs again next time.
 */
export const upgradeSchema = async (
  client: Client,
  scripts: readonly ScriptFile[],
  log: (line: string) => void
): Promise<string[]> =>
  withSchemaLock(client, async () => {
    const state = await schemaStatus(client, scripts)
    if (state.status === 'ok') return []
    if (state.status !== 'pending') throw new Error(describeSchemaState(state))

    const pending = scripts.filter((script) => state.scripts.includes(script.name))
    for (const script of pending) {
      log(`applying ${script.name}`)
      await client.query(script.sql)
      await recordScripts(client, [script])
    }
    return pending.map((script) => script.name)
  })

/**
 * Create the ledger for an installation whose schema was maintained by hand,
 * recording every shipped script up to and including `through` as applied.
 */
export const adoptSchema = async (
  client: Client,
  scripts: readonly ScriptFile[],
  through: string
): Promise<string[]> =>
  withSchemaLock(client, async () => {
    if ((await readLedger(client)) != null) {
      throw new Error('refusing to adopt: the database already has a script ledger')
    }
    if (!(await hasModulusTables(client))) {
      throw new Error(
        'refusing to adopt: the database has no Modulus schema; use `modulus db init`'
      )
    }
    if (!scripts.some((script) => script.name === through)) {
      throw new Error(`unknown script: ${through}`)
    }
    const adopted = scripts.filter((script) => script.name <= through)
    await client.query('BEGIN')
    try {
      await createLedger(client)
      await recordScripts(client, records(adopted))
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    return adopted.map((script) => script.name)
  })

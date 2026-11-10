import pg from 'pg'

import type { ScriptRecord } from './compare.js'

/**
 * The ledger of applied release scripts, in its own `modulus` schema so that
 * Drizzle tooling, which manages `public`, never proposes to drop it.
 */

const LEDGER = 'modulus.schema_scripts'

// Arbitrary constant key: one schema operation at a time per database.
const LOCK_KEY = 4_771_022_101

export type Client = pg.Client

export const openClient = async (connectionString: string): Promise<Client> => {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 })
  await client.connect()
  return client
}

export const withSchemaLock = async <T>(client: Client, work: () => Promise<T>): Promise<T> => {
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
  try {
    return await work()
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY])
  }
}

/** Applied scripts, or null when the ledger does not exist. */
export const readLedger = async (client: Client): Promise<ScriptRecord[] | null> => {
  const exists = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('${LEDGER}') IS NOT NULL AS ok`
  )
  if (!exists.rows[0]?.ok) return null
  const result = await client.query<ScriptRecord>(
    `SELECT name, checksum FROM ${LEDGER} ORDER BY name`
  )
  return result.rows
}

/** True when core's tables exist, whether or not a ledger does. */
export const hasModulusTables = async (client: Client): Promise<boolean> => {
  const result = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('public.users') IS NOT NULL AS ok`
  )
  return result.rows[0]?.ok ?? false
}

export const createLedger = async (client: Client): Promise<void> => {
  await client.query('CREATE SCHEMA IF NOT EXISTS modulus')
  await client.query(`CREATE TABLE IF NOT EXISTS ${LEDGER} (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`)
}

export const recordScripts = async (
  client: Client,
  scripts: readonly ScriptRecord[]
): Promise<void> => {
  for (const { name, checksum } of scripts) {
    await client.query(`INSERT INTO ${LEDGER} (name, checksum) VALUES ($1, $2)`, [name, checksum])
  }
}

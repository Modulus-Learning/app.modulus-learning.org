import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'

import * as schema from '../database/schema/index.js'
import { type Client, openClient } from '../database/schema-scripts/ledger.js'

export type CliOptions = {
  'database-url'?: string
  'env-file'?: string
}

/** Load an optional env file, then connect from --database-url or the environment. */
export const connectFromOptions = async (options: CliOptions): Promise<Client> => {
  if (options['env-file'] != null) process.loadEnvFile(options['env-file'])
  const connectionString = options['database-url'] ?? process.env.POSTGRES_CONNECTION_STRING
  if (connectionString == null) {
    throw new Error('no database: pass --database-url or set POSTGRES_CONNECTION_STRING')
  }
  return openClient(connectionString)
}

export const drizzleFor = (client: Client): NodePgDatabase<typeof schema> =>
  drizzle(client, { schema })

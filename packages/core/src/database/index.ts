import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema/index.js'

export type DB = NodePgDatabase<typeof schema>

type ConnectOptions = {
  connectionString: string
}

export const connect = ({ connectionString }: ConnectOptions): DB => {
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 2000,
    connectionTimeoutMillis: 30000, // TODO: make this configurable
  })

  return drizzle(pool, { schema })
}

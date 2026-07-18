import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { pushSchema } from 'drizzle-kit/api'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { pino } from 'pino'

import * as schema from '@/database/schema/index.js'
import { DBManagerImpl, TXManagerImpl } from '@/lib/db-manager.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CoreUtils } from '@/lib/utils.js'
import {
  ActivityStateMutations,
  ActivityStateQueries,
} from '@/modules/agent/activity-state/repository/index.js'
import {
  LtiScoreSubmissionMutations,
  LtiScoreSubmissionQueries,
} from '@/modules/app/lti/score-submission/repository.js'
import type { DB } from '@/database/index.js'

// The load-bearing SQL under test relies on Postgres-18 features (OLD/NEW
// references in RETURNING, among others), so pin the image accordingly.
const POSTGRES_IMAGE = 'postgres:18'

// Tables the integration suite writes to. TRUNCATE ... CASCADE clears dependents
// regardless of order, but listing the whole set keeps each pass hermetic.
const TABLES = [
  'lti_submission_failures',
  'lti_platform_incidents',
  'lti_platform_health',
  'lti_lineitems',
  'lti_platform_deployments',
  'lti_platforms',
  'progress_events',
  'page_state',
  'progress',
  'activities',
  'users',
]

export type TestRepos = {
  scoreQueries: LtiScoreSubmissionQueries
  scoreMutations: LtiScoreSubmissionMutations
  activityQueries: ActivityStateQueries
  activityMutations: ActivityStateMutations
}

export type TestHarness = {
  db: DB
  pool: Pool
  dbManager: DBManagerImpl
  tx: TXManagerImpl
  utils: CoreUtils
  repos: TestRepos
  truncateAll: () => Promise<void>
  teardown: () => Promise<void>
}

/**
 * Brings up a Postgres the integration suite can own end-to-end:
 *   - Connects to `TEST_POSTGRES_CONNECTION_STRING` when set; otherwise starts an
 *     ephemeral `postgres:18` container via testcontainers.
 *   - Materializes the live schema straight from `schema/index.ts` with
 *     drizzle-kit's `pushSchema` -- deliberately *not* from the committed
 *     migrations, which on this branch may lag the schema source.
 *   - Hand-wires the repositories under test over the real DB.
 *
 * Call once per test file in `before`, `teardown()` in `after`, and
 * `truncateAll()` in `beforeEach`.
 */
export async function setupTestHarness(): Promise<TestHarness> {
  const external = process.env.TEST_POSTGRES_CONNECTION_STRING
  let container: StartedPostgreSqlContainer | undefined
  let connectionString: string

  if (external != null && external.length > 0) {
    connectionString = external
  } else {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
    connectionString = container.getConnectionUri()
  }

  const pool = new Pool({ connectionString, max: 10 })
  const db = drizzle(pool, { schema })

  // `pushSchema` types its DB param as a relations-less PgDatabase; our
  // schema-typed instance is structurally fine at runtime, so bridge the types.
  const { apply } = await pushSchema(
    schema as Record<string, unknown>,
    db as unknown as Parameters<typeof pushSchema>[1]
  )
  await apply()

  const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })
  const utils = new CoreUtils({ logger })
  const dbManager = new DBManagerImpl({ dbPool: db })
  const tx = new TXManagerImpl({ db: dbManager })

  const deps = { logger, utils, db: dbManager }
  const repos: TestRepos = {
    scoreQueries: new LtiScoreSubmissionQueries(deps),
    scoreMutations: new LtiScoreSubmissionMutations(deps),
    activityQueries: new ActivityStateQueries(deps),
    activityMutations: new ActivityStateMutations(deps),
  }

  const truncateAll = async (): Promise<void> => {
    await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)
  }

  const teardown = async (): Promise<void> => {
    await pool.end()
    if (container != null) {
      await container.stop()
    }
  }

  return { db, pool, dbManager, tx, utils, repos, truncateAll, teardown }
}

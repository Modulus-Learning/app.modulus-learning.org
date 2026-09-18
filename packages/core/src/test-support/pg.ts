import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { pino } from 'pino'

import * as schema from '@/database/schema/index.js'
import { DBManagerImpl, TXManagerImpl } from '@/lib/db-manager.js'
import { createCoreLogger } from '@/lib/logger.js'
import { CoreUtils } from '@/lib/utils.js'
import {
  ActivityUrlAllowlistMutations,
  ActivityUrlAllowlistQueries,
} from '@/modules/activity-registration/repository/index.js'
import { ActivityRegistrationService } from '@/modules/activity-registration/services/activity-registration.js'
import { AllowlistPolicyService } from '@/modules/activity-registration/services/allowlist-policy.js'
import {
  ActivityStateMutations,
  ActivityStateQueries,
} from '@/modules/agent/activity-state/repository/index.js'
import { ActivityPageStateService } from '@/modules/agent/activity-state/services/pagestate.js'
import { ActivityProgressService } from '@/modules/agent/activity-state/services/progress.js'
import { AgentAuthMutations, AgentAuthQueries } from '@/modules/agent/auth/repository/index.js'
import { AgentAuthService } from '@/modules/agent/auth/services/agent-auth.js'
import {
  ActivityMutations as AppActivityMutations,
  ActivityQueries as AppActivityQueries,
} from '@/modules/app/activities/repository/index.js'
import { ActivityService as AppActivityService } from '@/modules/app/activities/services/activity.js'
import { EnrollmentService } from '@/modules/app/activities/services/enrollment.js'
import { LtiMutations, LtiQueries } from '@/modules/app/lti/repository/index.js'
import {
  LtiScoreSubmissionMutations,
  LtiScoreSubmissionQueries,
} from '@/modules/app/lti/score-submission/repository.js'
import { LtiScoreSubmitter } from '@/modules/app/lti/score-submission/submitter.js'
import { LtiDeepLinkingService } from '@/modules/app/lti/services/deep-link.js'
import { LtiLaunchService } from '@/modules/app/lti/services/launch.js'
import { testConfig } from '@/test-support/config.js'
import type { Config, UrlBuilder } from '@/config.js'
import type { DB } from '@/database/index.js'
import type { LtiKeyStore } from '@/lib/lti-keystore.js'
import type { AgentTokenIssuer } from '@/modules/agent/auth/services/token-issuer.js'
import type { LtiAgsClient } from '@/modules/app/lti/score-submission/ags-client.js'
import type { LtiSignInService } from '@/modules/app/session/services/lti-sign-in.js'
import type { TokenIssuer } from '@/modules/app/session/services/token-issuer.js'

const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../database/migrations'
)

/** Refuse integration-test DDL and truncation against a non-test database. */
export function assertTestDatabase(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new Error(
      'POSTGRES_CONNECTION_STRING is not set. Copy packages/core/.env.test.example to .env.test.'
    )
  }

  let databaseName: string
  try {
    const url = new URL(connectionString)
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      throw new Error('protocol must be postgres: or postgresql:')
    }
    databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  } catch (error) {
    throw new Error(`POSTGRES_CONNECTION_STRING is not a valid URL: ${(error as Error).message}`)
  }

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against database '${databaseName}'. ` +
        `The database name must end in '_test'.`
    )
  }

  return connectionString
}

export type TestRepos = {
  ltiMutations: LtiMutations
  ltiQueries: LtiQueries
  scoreQueries: LtiScoreSubmissionQueries
  scoreMutations: LtiScoreSubmissionMutations
  activityQueries: ActivityStateQueries
  activityMutations: ActivityStateMutations
  appActivityQueries: AppActivityQueries
  appActivityMutations: AppActivityMutations
  allowlistQueries: ActivityUrlAllowlistQueries
  allowlistMutations: ActivityUrlAllowlistMutations
  agentAuthQueries: AgentAuthQueries
  agentAuthMutations: AgentAuthMutations
}

// Service-layer seam for the 7.1b composition tests: the real service over the
// real DB (`ActivityProgressService` needs no fakes), plus a factory that builds
// a submitter around an injected (fake) AGS client.
export type TestServices = {
  activityProgress: ActivityProgressService
  activityPageState: ActivityPageStateService
  allowlistPolicy: AllowlistPolicyService
  activityRegistration: ActivityRegistrationService
  appActivity: AppActivityService
  enrollment: EnrollmentService
  /** Built per test, so a fake key store and url builder can be injected. */
  makeDeepLinking: (deps: {
    urlBuilder: UrlBuilder
    ltiKeyStore: LtiKeyStore
  }) => LtiDeepLinkingService
  /**
   * Built per test, so the issued access token can be inspected. Registration,
   * the auth-code store, and the activity lookup are all real.
   */
  makeAgentAuth: (deps: { config: Config; tokenIssuer: AgentTokenIssuer }) => AgentAuthService
  /**
   * Built per test, so LMS sign-in and session tokens -- the launch's outbound
   * effects -- can be faked while activity resolution, enrollment, scope
   * resolution, and line-item reconciliation run against the real database.
   */
  makeLtiLaunch: (deps: {
    config: Config
    ltiSignInService: LtiSignInService
    tokenIssuer: TokenIssuer
  }) => LtiLaunchService
  makeSubmitter: (agsClient: LtiAgsClient) => LtiScoreSubmitter
}

export type TestHarness = {
  db: DB
  pool: Pool
  dbManager: DBManagerImpl
  tx: TXManagerImpl
  utils: CoreUtils
  repos: TestRepos
  services: TestServices
  truncateAll: () => Promise<void>
  teardown: () => Promise<void>
}

/**
 * Connects to the dedicated `_test` database supplied by `.env.test` or CI:
 *   - Accepts `POSTGRES_CONNECTION_STRING`; the former
 *     `TEST_POSTGRES_CONNECTION_STRING` remains a compatibility override.
 *   - Applies the committed Drizzle migrations, making migration completeness
 *     part of the integration gate instead of bypassing history with a schema push.
 *   - Hand-wires the repositories under test over the real DB.
 *
 * Call once per test file in `before`, `teardown()` in `after`, and
 * `truncateAll()` in `beforeEach`.
 */
export async function setupTestHarness(): Promise<TestHarness> {
  // CI normally provides the variable directly; local runs use the ignored
  // package-level file. dotenv preserves an already-defined CI value.
  loadEnv({ path: '.env.test', quiet: true })

  const connectionString = assertTestDatabase(
    process.env.TEST_POSTGRES_CONNECTION_STRING ?? process.env.POSTGRES_CONNECTION_STRING
  )

  const pool = new Pool({ connectionString, max: 10 })
  const db = drizzle(pool, { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })

  const logger = createCoreLogger({ pinoLogger: pino({ level: 'silent' }) })
  const utils = new CoreUtils({ logger })
  const dbManager = new DBManagerImpl({ dbPool: db })
  const tx = new TXManagerImpl({ db: dbManager })

  const deps = { logger, utils, db: dbManager }
  const repos: TestRepos = {
    ltiMutations: new LtiMutations(deps),
    ltiQueries: new LtiQueries(deps),
    scoreQueries: new LtiScoreSubmissionQueries(deps),
    scoreMutations: new LtiScoreSubmissionMutations(deps),
    activityQueries: new ActivityStateQueries(deps),
    activityMutations: new ActivityStateMutations(deps),
    appActivityQueries: new AppActivityQueries(deps),
    appActivityMutations: new AppActivityMutations(deps),
    allowlistQueries: new ActivityUrlAllowlistQueries(deps),
    allowlistMutations: new ActivityUrlAllowlistMutations(deps),
    agentAuthQueries: new AgentAuthQueries(deps),
    agentAuthMutations: new AgentAuthMutations(deps),
  }

  const allowlistPolicy = new AllowlistPolicyService({
    logger,
    queries: repos.allowlistQueries,
  })

  const activityRegistration = new ActivityRegistrationService({
    logger,
    queries: repos.allowlistQueries,
    mutations: repos.allowlistMutations,
    policy: allowlistPolicy,
  })

  const enrollment = new EnrollmentService({
    logger,
    queries: repos.appActivityQueries,
    mutations: repos.appActivityMutations,
  })

  const services: TestServices = {
    activityProgress: new ActivityProgressService({
      logger,
      tx,
      queries: repos.activityQueries,
      mutations: repos.activityMutations,
      activityRegistration: { service: activityRegistration },
    }),
    activityPageState: new ActivityPageStateService({
      logger,
      queries: repos.activityQueries,
      mutations: repos.activityMutations,
    }),
    allowlistPolicy,
    activityRegistration,
    appActivity: new AppActivityService({
      logger,
      tx,
      queries: repos.appActivityQueries,
      mutations: repos.appActivityMutations,
      activityRegistration: { service: activityRegistration },
    }),
    enrollment,
    makeDeepLinking: ({ urlBuilder, ltiKeyStore }) =>
      new LtiDeepLinkingService({
        logger,
        urlBuilder,
        queries: repos.ltiQueries,
        activities: { queries: repos.appActivityQueries, mutations: repos.appActivityMutations },
        ltiKeyStore,
        activityRegistration: { service: activityRegistration },
      }),
    makeAgentAuth: ({ config, tokenIssuer }) =>
      new AgentAuthService({
        logger,
        config,
        queries: repos.agentAuthQueries,
        mutations: repos.agentAuthMutations,
        tokenIssuer,
        activityRegistration: { service: activityRegistration },
      }),
    makeLtiLaunch: ({ config, ltiSignInService, tokenIssuer }) =>
      new LtiLaunchService({
        logger,
        config,
        tx,
        queries: repos.ltiQueries,
        mutations: repos.ltiMutations,
        activities: { queries: repos.appActivityQueries, enrollmentService: enrollment },
        session: { ltiSignInService, tokenIssuer },
      }),
    makeSubmitter: (agsClient) =>
      new LtiScoreSubmitter({
        logger,
        config: testConfig,
        scoreSubmissionMutations: repos.scoreMutations,
        agsClient,
      }),
  }

  const truncateAll = async (): Promise<void> => {
    const result = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '__drizzle_migrations'
    `)
    const tables = result.rows.map(
      ({ table_name }) => `"public"."${table_name.replaceAll('"', '""')}"`
    )
    if (tables.length > 0) {
      await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`)
    }
    await pool.query('INSERT INTO scopes (id) VALUES ($1) ON CONFLICT DO NOTHING', [
      schema.DEFAULT_SCOPE_ID,
    ])
  }

  const teardown = async (): Promise<void> => {
    try {
      await truncateAll()
    } finally {
      await pool.end()
    }
  }

  return { db, pool, dbManager, tx, utils, repos, services, truncateAll, teardown }
}

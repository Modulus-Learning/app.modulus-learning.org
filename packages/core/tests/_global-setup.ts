import { config as loadEnv } from 'dotenv'

import { assertTestDatabase } from '../src/test-support/pg.js'

/**
 * Vitest `globalSetup` for the integration suite: runs once, before any test
 * file loads, and refuses a database whose name does not end in `_test`.
 *
 * `test.env` does not reach global setup, so `.env.test` is loaded here. An
 * error thrown from global setup can surface only as a misleading Vite
 * stack-mapping error, so its message is printed before it is rethrown.
 * Migrations stay in the per-file harness (`setupTestHarness`).
 */
export default function setup() {
  try {
    loadEnv({ path: '.env.test', quiet: true })
    // The same connection the harness uses: the compatibility override first.
    assertTestDatabase(
      process.env.TEST_POSTGRES_CONNECTION_STRING ?? process.env.POSTGRES_CONNECTION_STRING
    )
  } catch (error) {
    console.error(`integration global setup failed: ${(error as Error).message}`)
    throw error
  }
}

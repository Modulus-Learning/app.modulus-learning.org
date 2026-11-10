import { config as loadEnv } from 'dotenv'

import { assertTestDatabase } from '../src/test-support/pg.js'

// Runs inside each test worker before its file: the same `_test` guard as
// global setup, checked where the tests actually open their connections.
loadEnv({ path: '.env.test', quiet: true })
// The same connection the harness uses: the compatibility override first.
assertTestDatabase(
  process.env.TEST_POSTGRES_CONNECTION_STRING ?? process.env.POSTGRES_CONNECTION_STRING
)

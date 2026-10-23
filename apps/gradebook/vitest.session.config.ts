import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

/**
 * Session HTTP suite: authenticated pages, server-function principal checks,
 * sign-in/renewal cookie pairs and a successful LTI launch, driven over HTTP
 * against the BUILT Start server with synthetic identities. The global setup
 * boots `.output/server/index.mjs` itself, seeds the disposable `*_test`
 * database and runs a mock LTI platform. Build first: `pnpm build:start`.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/session-http/**/*.session.ts'],
    globalSetup: ['src/session-http/global-setup.ts'],
    environment: 'node',
    reporters: ['verbose'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
})

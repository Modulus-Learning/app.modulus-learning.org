import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

/**
 * Route-contract suite (spec Task 3). Drives a RUNNING server over HTTP, so it
 * is not part of `pnpm test`. Point it at a server with:
 *
 *   CONTRACT_BASE_URL  default http://localhost:3000
 *   CONTRACT_TARGET    start (default) | next — `next` selects the removed Next
 *                      app's recorded expectations
 *   CONTRACT_MODE      all-in-one | frontend | admin — must match the server's
 *                      DEPLOYMENT_MODE
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['src/contract/**/*.contract.ts'],
    environment: 'node',
    reporters: ['verbose'],
    // One server, shared state (cookies are per request): keep it serial.
    fileParallelism: false,
  },
})

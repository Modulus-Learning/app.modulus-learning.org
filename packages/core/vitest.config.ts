import { transform } from 'esbuild'
import { defineConfig, type Plugin } from 'vitest/config'

/**
 * Core uses TC39 decorators (`@method`, `@cached`). Vite's default transform
 * (Oxc) leaves that syntax in its output, which Node cannot run, so source
 * files containing a decorator are compiled first by esbuild with a target
 * that lowers decorators, as `tsx` did under `node:test`.
 */
const tc39Decorators = (): Plugin => ({
  name: 'modulus-core:tc39-decorators',
  enforce: 'pre',
  async transform(code, id) {
    if (!id.endsWith('.ts') || id.includes('/node_modules/') || !/^\s*@\w/m.test(code)) {
      return null
    }
    const result = await transform(code, {
      loader: 'ts',
      format: 'esm',
      target: 'es2022',
      sourcefile: id,
      sourcemap: true,
    })
    return { code: result.code, map: result.map }
  },
})

export default defineConfig(({ mode }) => {
  // Unit:        vitest run --mode=node          → src/**/*.test.node.ts, no database
  // Integration: vitest run --mode=integration   → src/**/tests/**/*.test.ts, against
  //              the `_test` database named in .env.test, one file at a time
  const isIntegration = mode === 'integration'

  return {
    plugins: [tc39Decorators()],
    resolve: { tsconfigPaths: true },
    test: {
      environment: 'node',
      include: isIntegration ? ['src/**/tests/**/*.test.ts'] : ['src/**/*.test.node.ts'],
      reporter: 'verbose',
      ...(isIntegration
        ? {
            // The guard runs once before any file loads, and again inside each
            // worker. Files run serially: every file truncates the shared
            // database, so two files must never overlap.
            globalSetup: ['./tests/_global-setup.ts'],
            setupFiles: ['./tests/_per-file-setup.ts'],
            fileParallelism: false,
            maxWorkers: 1,
            testTimeout: 30_000,
            hookTimeout: 60_000,
          }
        : {}),
    },
  }
})

import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  // Unit tests only: vitest run --mode=node → src/**/*.test.node.ts
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.node.ts'],
    reporter: 'verbose',
  },
}))

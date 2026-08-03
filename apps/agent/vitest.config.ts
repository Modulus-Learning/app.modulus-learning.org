import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const isNode = mode === 'node'

  return {
    plugins: [tsconfigPaths()],
    test: {
      environment: isNode ? 'node' : 'jsdom',
      include: isNode
        ? ['**/*.test.node.ts', '**/*.test.node.tsx']
        : ['**/*.test.ts', '**/*.test.tsx'],
      reporter: 'verbose',
      globals: true,
    },
  }
})

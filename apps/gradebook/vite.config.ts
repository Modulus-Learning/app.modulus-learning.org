import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, type Plugin } from 'vite'

// Packages that load native binaries, are CJS-only, or locate files through
// `__dirname` must stay external so Node resolves them at runtime. Each needs
// listing for both Vite's SSR build and Nitro's own bundler.
const nativeExternals = [
  'argon2',
  'bcrypt',
  'pino',
  'pg',
  'googleapis',
  '@google-cloud/recaptcha-enterprise',
  'google-gax',
]

// Host overrides (spec: Execution Rules → shared components). During the
// migration a module `x.ts` may have a sibling `x.start.ts` with the same
// exports, implemented for this host (typically server-function wrappers in
// place of a Next server action). Every import of `x` in this build resolves
// to the sibling; the Next host and the test suite keep the original. The
// `host-override-convention` test keeps the exports in step.
const srcDir = fileURLToPath(new URL('./src/', import.meta.url))
const hostOverrides = (): Plugin => ({
  name: 'modulus:host-overrides',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (importer == null || (source.includes('.start') && !source.endsWith('?original')))
      return null
    // `?original` imports the overridden module itself (the action bridge).
    if (source.endsWith('?original')) {
      const original = await this.resolve(source.slice(0, -'?original'.length), importer, {
        ...options,
        skipSelf: true,
      })
      return original?.id ?? null
    }
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
    if (resolved == null || resolved.external || !resolved.id.startsWith(srcDir)) return null
    const match = resolved.id.match(/^(.*)\.(ts|tsx)(\?.*)?$/)
    if (match == null) return null
    for (const ext of ['ts', 'tsx']) {
      const override = `${match[1]}.start.${ext}`
      if (override !== importer && existsSync(override)) return `${override}${match[3] ?? ''}`
    }
    return null
  },
})

// Server-side shims for the two Next modules that bridged Next server actions
// import (`@/lib/action-bridge`). Server environments resolve them to
// `src/lib/next-shims/*`; reaching them from the client build is a bug, so it
// fails the build. Removed in Task 18 with the bridge.
const nextShimTargets: Record<string, string> = {
  'next/headers': fileURLToPath(new URL('./src/lib/next-shims/headers.ts', import.meta.url)),
  'next/navigation': fileURLToPath(new URL('./src/lib/next-shims/navigation.ts', import.meta.url)),
}
const nextShims = (): Plugin => ({
  name: 'modulus:next-shims',
  enforce: 'pre',
  resolveId(source, importer) {
    const target = nextShimTargets[source]
    if (target == null) return null
    if (this.environment?.name === 'client') {
      this.error(`${source} imported into the client build from ${importer ?? 'unknown'}`)
    }
    return target
  },
})

// `devlti:start` serves HTTPS on the LTI dev host, as Canvas will not launch
// against plain HTTP. The certs are local-only (see CLAUDE.md).
const https =
  process.env.DEV_HTTPS === 'true'
    ? { key: readFileSync('./certs/local.key'), cert: readFileSync('./certs/local.crt') }
    : undefined

export default defineConfig({
  server: { port: 3000, https },
  resolve: {
    tsconfigPaths: true,
    // Shared components import their navigation and image primitives from
    // `@/framework`; the Next host resolves that to `src/framework/index.ts`
    // (tsconfig paths), this host to the TanStack implementation.
    alias: {
      '@/framework': fileURLToPath(new URL('./src/framework/start.tsx', import.meta.url)),
    },
  },
  // Next owns postcss.config.js until Task 18; Vite uses @tailwindcss/vite and
  // must not run the PostCSS Tailwind plugin a second time.
  css: { postcss: { plugins: [] } },
  // `public/assets/` already exists, so hashed build assets go to `/_build/`.
  build: { assetsDir: '_build' },
  ssr: { external: nativeExternals },
  optimizeDeps: { exclude: nativeExternals },
  plugins: [
    hostOverrides(),
    nextShims(),
    nitro({
      preset: 'node',
      // Boot the app (config validation, jobs, shutdown handlers) at process
      // start rather than on the first request; see the plugin.
      plugins: ['./src/nitro/eager-boot.ts'],
      // React must be external by pattern: externalising only 'react' and
      // 'react-dom' leaves subpaths such as react-dom/server bundled, and SSR
      // then runs two React instances ("dispatcher.getOwner is not a function").
      rolldownConfig: { external: [/^react(-dom)?(\/.*)?$/, ...nativeExternals] },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  clearScreen: false,
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

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
    nitro({
      preset: 'node',
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

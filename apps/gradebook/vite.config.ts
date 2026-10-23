import { readFileSync } from 'node:fs'

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

// Dependencies such as @base-ui/react and @tanstack/react-router mark their
// modules `'use client'`, a React Server Components directive with no meaning in
// this app. The bundler warns once per module that it drops it. Silence exactly
// that warning, for files under node_modules only; every other warning passes.
type BundlerWarning = { code?: string; message: string; id?: string }
const onwarn = (warning: BundlerWarning, warn: (warning: BundlerWarning) => void) => {
  const fromDependency = /node_modules/.test(warning.id ?? warning.message)
  if (
    warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
    warning.message.includes('"use client"') &&
    fromDependency
  ) {
    return
  }
  warn(warning)
}

// `devlti` serves HTTPS on the LTI dev host, as Canvas will not launch
// against plain HTTP. The certs are local-only (see CLAUDE.md).
const https =
  process.env.DEV_HTTPS === 'true'
    ? { key: readFileSync('./certs/local.key'), cert: readFileSync('./certs/local.crt') }
    : undefined

export default defineConfig({
  server: { port: 3000, https },
  resolve: {
    tsconfigPaths: true,
  },
  // Tailwind runs through @tailwindcss/vite; no PostCSS config is picked up.
  css: { postcss: { plugins: [] } },
  // `public/assets/` already exists, so hashed build assets go to `/_build/`.
  build: { assetsDir: '_build', rolldownOptions: { onwarn } },
  ssr: {
    external: nativeExternals,
    // `@infonomic/uikit` imports its own CSS modules. In dev, Vite leaves
    // dependencies external to SSR and Node cannot import a `.css` file, so the
    // package must go through Vite's pipeline (the production bundle already does).
    noExternal: ['@infonomic/uikit'],
  },
  optimizeDeps: { exclude: nativeExternals },
  plugins: [
    nitro({
      preset: 'node',
      // Boot the app (config validation, jobs, shutdown handlers) at process
      // start rather than on the first request; see the plugin.
      plugins: ['./src/nitro/eager-boot.ts'],
      // React must be external by pattern: externalising only 'react' and
      // 'react-dom' leaves subpaths such as react-dom/server bundled, and SSR
      // then runs two React instances ("dispatcher.getOwner is not a function").
      rolldownConfig: { external: [/^react(-dom)?(\/.*)?$/, ...nativeExternals], onwarn },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  clearScreen: false,
})

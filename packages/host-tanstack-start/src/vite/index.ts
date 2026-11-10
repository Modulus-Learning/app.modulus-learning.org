import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'

/**
 * Packages that load native binaries, are CJS-only, or locate files through
 * `__dirname` must stay external so Node resolves them at runtime. Each needs
 * listing for both Vite's SSR build and Nitro's own bundler.
 */
export const nativeExternals = [
  'argon2',
  'bcrypt',
  'pino',
  'pg',
  'googleapis',
  '@google-cloud/recaptcha-enterprise',
  'google-gax',
]

const modulusScope = /^@modulus-learning\//

/**
 * The Vite configuration every Modulus host needs: `@modulus-learning/*`
 * inlined through SSR so Start's compiler sees packaged server functions,
 * native packages kept external, and `@infonomic/uikit` (which imports its own
 * CSS) taken through Vite's pipeline in dev.
 */
export const modulus = (): Plugin => ({
  name: 'modulus:host',
  config: () => ({
    ssr: {
      external: nativeExternals,
      noExternal: [modulusScope, '@infonomic/uikit'],
    },
    optimizeDeps: { exclude: nativeExternals },
  }),
})

// Nitro resolves `plugins` entries as paths from the project root, not as
// package specifiers, so the packaged plugin is passed by absolute path.
const eagerBootPlugin = fileURLToPath(new URL('../nitro/eager-boot.js', import.meta.url))

type NitroOptions = {
  plugins?: string[]
  features?: { [key: string]: unknown }
  rolldownConfig?: { external?: unknown[]; [key: string]: unknown }
  [key: string]: unknown
}

/**
 * Merge the host's Nitro options with what every Modulus installation needs:
 * the eager-boot plugin (config validation, jobs and shutdown handlers at
 * process start rather than on the first request), React externalised by
 * pattern so SSR never runs two React instances, and the native externals.
 *
 * It also turns off Nitro's `fastResponse` feature, which Node builds enable
 * by default and which replaces the global `Response` with srvx's
 * `FastResponse`. Start copies a Response thrown from a server function with
 * `new Response(response.body, response)` and then sets headers on the copy;
 * `FastResponse` keeps the original as its init object and later spreads it,
 * which drops the inherited `status`. A gate's 401, 409 or 400 then reaches
 * the client as 200. The session HTTP suite covers this.
 */
export const modulusNitroOptions = <T extends NitroOptions>(options: T): T => ({
  ...options,
  features: { ...options.features, fastResponse: false },
  plugins: [eagerBootPlugin, ...(options.plugins ?? [])],
  rolldownConfig: {
    ...options.rolldownConfig,
    external: [
      /^react(-dom)?(\/.*)?$/,
      ...nativeExternals,
      ...(options.rolldownConfig?.external ?? []),
    ],
  },
})

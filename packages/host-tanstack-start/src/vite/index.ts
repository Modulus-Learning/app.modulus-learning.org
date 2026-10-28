import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'

const modulusScope = /^@modulus-learning\//

/**
 * Inline every `@modulus-learning/*` package through Vite's SSR pipeline so
 * Start's compiler sees packaged `createServerFn` calls and route files.
 */
export const modulus = (): Plugin => ({
  name: 'modulus:host',
  config: () => ({
    ssr: { noExternal: [modulusScope] },
  }),
  configEnvironment: (name) => {
    if (name === 'client') return
    return { resolve: { noExternal: [modulusScope] } }
  },
})

// Nitro resolves `plugins` entries as paths from the project root, not as
// package specifiers, so the packaged plugin is passed by absolute path.
const eagerBootPlugin = fileURLToPath(new URL('../nitro/eager-boot.js', import.meta.url))

type NitroOptions = {
  plugins?: string[]
  rolldownConfig?: { external?: unknown[]; [key: string]: unknown }
  [key: string]: unknown
}

/**
 * Merge the host's Nitro options with what every Modulus installation needs:
 * the eager-boot plugin, and React externalised by pattern so SSR never runs
 * two React instances.
 */
export const modulusNitroOptions = <T extends NitroOptions>(options: T): T => ({
  ...options,
  plugins: [eagerBootPlugin, ...(options.plugins ?? [])],
  rolldownConfig: {
    ...options.rolldownConfig,
    external: [/^react(-dom)?(\/.*)?$/, ...(options.rolldownConfig?.external ?? [])],
  },
})

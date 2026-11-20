import type { Plugin } from 'postcss'

const layers =
  'properties, base, infonomic-base, theme, infonomic-theme, modulus-theme, infonomic-functional, infonomic-typography, modulus-base, components, infonomic-components, modulus-components, overrides, infonomic-utilities, utilities'

/**
 * The Modulus cascade-layer order, lowest to highest precedence. It is the
 * `@infonomic/uikit` order, led by Tailwind's `properties` layer (which
 * Tailwind itself declares first, and which would otherwise land above
 * `utilities`), with the package's own layers placed directly above
 * the kit layer each extends: `modulus-theme` (default tokens), `modulus-base`
 * (base rules and typography) and `modulus-components` (component and block
 * CSS). An installation puts its own component CSS in `components`, brand
 * tokens and restyles in `overrides`, and Tailwind utilities land in
 * `utilities`, which has the final say.
 *
 * The packaged root route renders it as the first element in `<head>` so CSS
 * injected in development cannot establish a partial order first.
 */
export const MODULUS_LAYER_ORDER = `@layer ${layers};`

/**
 * PostCSS plugin that prepends MODULUS_LAYER_ORDER to every stylesheet before
 * the bundler hashes it. This covers production, where React hoists
 * stylesheet links above the inline head statement. The `modulus()` Vite
 * preset registers it. Repeated statements are harmless, but a partial order
 * cannot be repaired once the browser has seen it, so the plugin and the head
 * statement are used together.
 *
 * This module imports nothing from the React component graph at runtime.
 */
export function modulusLayerOrder(): Plugin {
  return {
    postcssPlugin: 'modulus-layer-order',
    Once(root, { AtRule }) {
      root.prepend(new AtRule({ name: 'layer', params: layers }))
    },
  }
}

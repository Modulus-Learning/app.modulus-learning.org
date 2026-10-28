import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@modulus-learning/host-tanstack-start/lib/server-fn'

/** The docs index for the TanStack Start host (markdown bundled at build time). */
export const listDocsFn = createServerFn({ method: 'GET' })
  .middleware([frontendSurfaceMiddleware])
  .handler(async () => (await import('./docs.server')).listDocs())

/** One doc's frontmatter and markdown body, or null when the slug is unknown. */
export const getDocFn = createServerFn({ method: 'GET' })
  .middleware([frontendSurfaceMiddleware])
  .validator((slug: string) => slug)
  .handler(async ({ data }) => (await import('./docs.server')).getDoc(data))

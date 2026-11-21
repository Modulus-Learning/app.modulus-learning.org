import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@modulus-learning/host-tanstack-start/lib/server-fn'

/** One standalone page's frontmatter and markdown body, or null when the slug is unknown. */
export const getPageFn = createServerFn({ method: 'GET' })
  .middleware([frontendSurfaceMiddleware])
  .validator((slug: string) => slug)
  .handler(async ({ data }) => (await import('./pages.server')).getPage(data))

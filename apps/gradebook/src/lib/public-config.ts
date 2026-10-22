import { createServerFn } from '@tanstack/react-start'

import { neutralMiddleware } from '@/lib/server-fn'
import type { PublicConfig } from '@/config'

export interface RootConfig {
  publicConfig: PublicConfig
  analyticsEnabled: boolean
  /** The one-shot flash message read (and cleared) by the request middleware. */
  flash: string | null
}

/**
 * Per-request values the root document needs, resolved on the server (spec:
 * Deployment Modes item 3): the public config — so one image carries the right
 * `publicServerUrl` per instance and the client never reads
 * `VITE_PUBLIC_SERVER_URL` from the build — the analytics switch, and the
 * flash message.
 */
export const getRootConfigFn = createServerFn({ method: 'GET' })
  .middleware([neutralMiddleware])
  .handler(async (): Promise<RootConfig> => {
    const [{ getPublicConfig, getServerConfig }, { getRequestScope }] = await Promise.all([
      import('@/config'),
      import('@/lib/request-scope'),
    ])
    return {
      publicConfig: getPublicConfig(),
      analyticsEnabled: getServerConfig().analyticsEnabled,
      flash: getRequestScope()?.flash ?? null,
    }
  })

import { notFound } from 'next/navigation'

import { getServerConfig } from '@/config'
import type { RouteClass } from './deployment-mode'

/**
 * Server-side defense-in-depth guard for the deployment-mode gate. Call this at
 * the top of a layout (or route handler) that belongs to a single surface; if
 * the current `DEPLOYMENT_MODE` does not serve that surface, it renders a 404
 * via Next's `notFound()`.
 *
 * The proxy (`withDeploymentMode`) is the primary gate, but it does not run on
 * the matcher-excluded `/lti/*` pages, and server actions / RSC requests do not
 * always traverse the matcher identically. Guarding the surface layouts makes
 * the block authoritative regardless of how the request arrives.
 */
export const assertSurfaceServed = (surface: Exclude<RouteClass, 'neutral'>): void => {
  const { deployment } = getServerConfig()
  if (deployment.mode === 'all-in-one') {
    return
  }
  if (deployment.mode !== surface) {
    notFound()
  }
}

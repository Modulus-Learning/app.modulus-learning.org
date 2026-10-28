import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'

/**
 * Forwards an LTI dynamic-registration request and returns the outcome for the
 * registration page (`/routes/lti/register`). Ported from the Next server
 * component `Registration.tsx`, including its call to `${api.baseUrl}/lti/register`.
 */
export const registerPlatformFn = createServerFn({ method: 'GET' })
  .middleware([frontendSurfaceMiddleware])
  .validator((input: { openid_configuration?: string; registration_token?: string }) => input)
  .handler(async ({ data }) => (await import('./register.server')).registerPlatform(data))

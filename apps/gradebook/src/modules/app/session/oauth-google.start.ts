import { createServerFn } from '@tanstack/react-start'

import { appSessionMiddleware, frontendSurfaceMiddleware } from '@/lib/server-fn'
import type { GoogleFormState } from './@types/index'

/** TanStack Start override of `./oauth-google.ts` (the sign-in and account-link actions). */
const googleAuthorizeUrlFn = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .validator((data: FormData) => data)
  .handler(async ({ data }) =>
    (await import('./oauth-start.server')).googleAuthorizeUrl(
      data.get('source') as string,
      data.get('callbackUrl') as string
    )
  )

const unlinkGoogleFn = createServerFn({ method: 'POST' })
  .middleware([appSessionMiddleware])
  .handler(async () => (await import('./oauth-start.server')).unlinkGoogle())

export async function startGoogleOAuthFlow(
  _prevState: GoogleFormState,
  formData: FormData
): Promise<GoogleFormState> {
  window.location.assign(await googleAuthorizeUrlFn({ data: formData }))
  return { status: 'success' }
}

export async function unlinkGoogleAccount(): Promise<GoogleFormState> {
  return unlinkGoogleFn()
}

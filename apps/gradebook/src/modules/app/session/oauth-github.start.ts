import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'
import type { GitHubFormState } from './@types/index'

/** TanStack Start override of `./oauth-github.ts` (the sign-in button's action). */
const githubAuthorizeUrlFn = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .validator((data: FormData) => data)
  .handler(async ({ data }) =>
    (await import('./oauth-start.server')).githubAuthorizeUrl(
      data.get('source')?.toString() ?? null,
      data.get('callbackUrl')?.toString() ?? null
    )
  )

export async function startGithubOAuthFlow(
  _prevState: GitHubFormState,
  formData: FormData
): Promise<GitHubFormState> {
  window.location.assign(await githubAuthorizeUrlFn({ data: formData }))
  return { status: 'success' }
}

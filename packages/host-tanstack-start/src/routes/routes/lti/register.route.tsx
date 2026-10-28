import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

import { z } from 'zod'

import { registerPlatformFn } from '@/modules/lti/register'

/**
 * LTI dynamic-registration page, shown to the platform admin during tool
 * registration, at its existing URL `/routes/lti/register` (spec: Task 13).
 *
 * https://www.imsglobal.org/spec/lti-dr/v1p0#step-1-registration-initiation-request
 */
export const createRoute = (path: string) => {
  // biome-ignore lint/suspicious/noExplicitAny: a factory-supplied path bypasses route-tree typing
  const Route: any = createFileRoute(path as never)({
    validateSearch: z.object({
      openid_configuration: z.string().optional(),
      registration_token: z.string().optional(),
    }),
    loaderDeps: ({ search }) => search,
    loader: ({ deps }) => registerPlatformFn({ data: deps }),
    pendingComponent: () => <div>Dynamic registration in progress...</div>,
    component: lazyRouteComponent(() => import('./register.page'), 'Page'),
  })
  return Route
}

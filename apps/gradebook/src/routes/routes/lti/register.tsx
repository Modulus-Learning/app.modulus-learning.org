import { createFileRoute } from '@tanstack/react-router'

import { RegistrationResults } from '@modulus-learning/host-tanstack-start/modules/lti/components/RegistrationResult'
import { registerPlatformFn } from '@modulus-learning/host-tanstack-start/modules/lti/register'
import { z } from 'zod'

/**
 * LTI dynamic-registration page, shown to the platform admin during tool
 * registration, at its existing URL `/routes/lti/register` (spec: Task 13).
 *
 * https://www.imsglobal.org/spec/lti-dr/v1p0#step-1-registration-initiation-request
 */
export const Route = createFileRoute('/routes/lti/register')({
  validateSearch: z.object({
    openid_configuration: z.string().optional(),
    registration_token: z.string().optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => registerPlatformFn({ data: deps }),
  pendingComponent: () => <div>Dynamic registration in progress...</div>,
  component: function RegistrationPage() {
    const { success, data } = Route.useLoaderData()
    return <RegistrationResults success={success} data={data} />
  },
})

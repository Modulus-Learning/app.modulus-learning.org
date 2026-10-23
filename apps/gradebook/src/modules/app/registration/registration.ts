import { createServerFn } from '@tanstack/react-start'

import { frontendSurfaceMiddleware } from '@/lib/server-fn'
import type {
  RegistrationStep1FormState,
  RegistrationStep2FormState,
  RegistrationStep3FormState,
} from './@types'

/**
 * The registration forms' `(prevState, formData)` actions, which they pass to
 * `useActionState`, implemented over surface-gated server functions.
 */

const step1Fn = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .validator((data: FormData) => data)
  .handler(async ({ data }) => (await import('./registration.server')).step1(data))

const step2Fn = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .validator((data: FormData) => data)
  .handler(async ({ data }) => (await import('./registration.server')).step2(data))

const step3Fn = createServerFn({ method: 'POST' })
  .middleware([frontendSurfaceMiddleware])
  .validator((data: FormData) => data)
  .handler(async ({ data }) => (await import('./registration.server')).step3(data))

export const registrationStep1 = async (
  _prevState: RegistrationStep1FormState,
  formData: FormData
): Promise<RegistrationStep1FormState> => step1Fn({ data: formData })

export const registrationStep2 = async (
  _prevState: RegistrationStep2FormState,
  formData: FormData
): Promise<RegistrationStep2FormState> => step2Fn({ data: formData })

/** On success the new learner session is installed; navigate with a full load (coordinated). */
export const registrationStep3 = async (
  _prevState: RegistrationStep3FormState,
  formData: FormData
): Promise<RegistrationStep3FormState> => {
  const { coordinateAuthAction, notifySessionAction } = await import('@/lib/session/coordination')
  return coordinateAuthAction('user', async () => {
    const { state, redirectTo } = await step3Fn({ data: formData })
    if (redirectTo != null) {
      notifySessionAction('user')
      window.location.assign(redirectTo)
    }
    return state
  })
}

import type React from 'react'
import { Suspense } from 'react'

import Registration, { type RegistrationProps } from '@/modules/lti/components/Registration'

/**
 * Registration page, displayed to LTI platform admin during tool registration
 * process.
 *
 * https://www.imsglobal.org/spec/lti-dr/v1p0#overview
 * https://www.imsglobal.org/spec/lti-dr/v1p0#step-1-registration-initiation-request
 *
 * Dynamic registration begins with the platform redirecting the platform
 * admin's browser to a tool-provided 'initiate registration' url, along with
 * some query parameters the tool needs in order to register with the platform.
 * In response, the tool may perform the registration immediately, or may
 * display some UI and get input from the platform admin first.
 */
export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<RegistrationProps>
}): Promise<React.JSX.Element> {
  const { openid_configuration, registration_token } = await searchParams

  // TODO: Validate openid_configuration and registration_token here, before
  // doing anything else.

  return (
    <Suspense fallback={<div>Dynamic registration in progress...</div>}>
      <Registration
        openid_configuration={openid_configuration}
        registration_token={registration_token}
      />
    </Suspense>
  )
}

import { getServerConfig } from '@/config'
import { RegistrationResults } from './RegistrationResult'

export type RegistrationProps = {
  openid_configuration: string
  registration_token: string | undefined
}

/**
 * A server component that forwards an LTI dynamic registration request to the
 * API and displays the results of that registration when they're ready.  Meant
 * to be wrapped in a <Suspense />
 */
export default async function Registration({
  openid_configuration,
  registration_token,
}: RegistrationProps) {
  // TODO: Add auth headers etc
  const REGISTRATION_URL = `${getServerConfig().api.baseUrl}/lti/register`
  const response = await fetch(REGISTRATION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ openid_configuration, registration_token }),
  })

  // TODO: Validate response?
  const data = await response.json()

  return <RegistrationResults success={response.ok} data={data} />
}

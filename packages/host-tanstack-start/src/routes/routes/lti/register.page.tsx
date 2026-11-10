import { useLoaderData } from '@tanstack/react-router'

import { RegistrationResults } from '@/modules/lti/components/RegistrationResult'

export const Page = function RegistrationPage() {
  const { success, data } = useLoaderData({ strict: false })
  return <RegistrationResults success={success} data={data} />
}

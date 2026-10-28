import { useSearch } from '@tanstack/react-router'

import { LtiErrorView } from '@/modules/lti/components/lti-error-view'

export const Page = function ErrorPage() {
  const { code } = useSearch({ strict: false })
  return <LtiErrorView code={code} />
}

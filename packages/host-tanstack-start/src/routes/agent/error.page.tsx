import { useSearch } from '@tanstack/react-router'

import { AgentErrorView } from '@/modules/agent/components/agent-error-view'

export const Page = function ErrorPage() {
  const { code } = useSearch({ strict: false })
  return <AgentErrorView code={code} />
}

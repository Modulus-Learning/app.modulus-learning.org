import { useSearch } from '@tanstack/react-router'

import { SessionBootstrap } from '@/lib/session/session-bootstrap'

export const Page = function AdminRenew() {
  const search = useSearch({ strict: false })
  return <SessionBootstrap domain="admin" returnParam={search.return ?? null} />
}

import { useSearch } from '@tanstack/react-router'

import { SessionBootstrap } from '@/lib/session/session-bootstrap'

export const Page = function UserRenew() {
  const search = useSearch({ strict: false })
  return <SessionBootstrap domain="user" returnParam={search.return ?? null} />
}

import { useSyncExternalStore } from 'react'

import { Card } from '@infonomic/uikit/react'

import { useModulus } from './modulus-provider'

export const UserDebugCard: React.FC = () => {
  const { modulus } = useModulus()

  const user = useSyncExternalStore(
    (cb) => modulus.on('ready', cb),
    () => modulus.user()
  )

  return (
    user && (
      <Card className="max-w-[400px] p-4 mx-auto">
        <pre>{JSON.stringify(user, null, 2)}</pre>
      </Card>
    )
  )
}

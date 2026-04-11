import { useSyncExternalStore } from 'react'

import { Card } from '@infonomic/uikit/react'
import cx from 'classnames'

import { useModulus } from './modulus-provider'

interface Props {
  activityName: string
}

export const ProgressBar: React.FC<Props> = ({ activityName }) => {
  const { modulus } = useModulus()

  const modulusIsConnected = useSyncExternalStore(
    (cb) => modulus.on('ready', cb),
    () => modulus.user() != null
  )

  const progress = useSyncExternalStore(
    (cb) => modulus.on('progress-changed', cb),
    () => modulus.progress()
  )

  const submittedProgress = useSyncExternalStore(
    (cb) => modulus.on('progress-submitted', cb),
    () => modulus.submittedProgress()
  )

  return (
    <Card className="max-w-[400px] mx-auto p-4">
      <h3 className="text-3xl mb-2">{activityName}</h3>
      <div className="w-full bg-canvas-700 rounded-full h-2.5 relative">
        <div
          className={cx('h-2.5 rounded-full absolute top-0 left-0 z-10', {
            'bg-green-300': modulusIsConnected,
            'bg-green-700': !modulusIsConnected,
          })}
          style={{ width: `${progress * 100}%` }}
        />
        {modulusIsConnected && (
          <div
            className="bg-green-700 h-2.5 rounded-full absolute top-0 left-0 z-20"
            style={{ width: `${submittedProgress * 100}%` }}
          />
        )}
      </div>
    </Card>
  )
}

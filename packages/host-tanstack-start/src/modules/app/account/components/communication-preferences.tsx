import type React from 'react'
import { useState } from 'react'

import type { ActionProps } from '../@types'

export const CommunicationPreferences: React.FC<ActionProps> = ({
  user,
  lng,
  onClose,
  onSuccess,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false)

  const _handleOnCancelOrClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (isEditing === false) {
      if (onClose != null) onClose()
    } else {
      setIsEditing(false)
    }
  }

  return (
    <div>
      <p>Communication preferences form here...</p>
    </div>
  )
}

import type React from 'react'
import { useState } from 'react'

import { ChangeEmail } from './change-email'
import { VerifyEmail } from './verify-email'
import type { ActionProps } from '../../@types'

export function ChangeEmailContainer({
  user,
  lng,
  onClose,
  onSuccess,
}: ActionProps): React.JSX.Element {
  const [requestSubmitted, setRequestSubmitted] = useState(false)
  const [newEmailAddress, setNewEmailAddress] = useState('')

  const handleOnChangeEmailSuccess = (email: string | null | undefined) => {
    if (email != null) {
      setRequestSubmitted(true)
      setNewEmailAddress(email)
    }
  }

  if (requestSubmitted) {
    return (
      <VerifyEmail
        email={newEmailAddress}
        user={user}
        lng={lng}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    )
  }

  return (
    <ChangeEmail user={user} lng={lng} onClose={onClose} onSuccess={handleOnChangeEmailSuccess} />
  )
}

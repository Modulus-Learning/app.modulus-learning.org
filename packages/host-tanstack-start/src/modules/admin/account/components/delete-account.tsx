import type React from 'react'

import { Button, Modal } from '@infonomic/uikit/react'

import type { ActionProps } from '../@types'

export const DeleteAccount: React.FC<ActionProps> = ({ user, lng, onClose, onSuccess }) => {
  const handleOnCancelOrClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (onClose != null) onClose()
  }

  return (
    <>
      <Modal.Content>
        <p>
          Warning: Deleting your account is permanent and cannot be undone. All of your data will be
          deleted and you will no longer be able to access your account.
        </p>
      </Modal.Content>
      <Modal.Actions>
        <button data-autofocus type="button" tabIndex={0} className="sr-only">
          no action
        </button>
        <Button size="md" intent="noeffect" onClick={handleOnCancelOrClose}>
          Cancel
        </Button>
        <Button size="md" intent="danger" onClick={handleOnCancelOrClose}>
          Delete Account
        </Button>
      </Modal.Actions>
    </>
  )
}

import type React from 'react'
import { startTransition, useActionState, useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, LoaderEllipsis } from '@infonomic/uikit/react'
import { useForm } from 'react-hook-form'

import { getErrorText, hasErrors } from '@/utils/utils.forms'
import { changeEmailSchema, type User } from '../../@types'
import { changeEmail } from '../../change-email'
import type { Locale } from '@/i18n/i18n-config'
import type { ChangeEmailFormState } from '../../@types'

type ChangeEmailProps = {
  user: User
  lng: Locale
  onClose?: () => void
  onSuccess?: (email: string | null | undefined) => void
}

export function ChangeEmail({
  user,
  lng,
  onClose,
  onSuccess,
}: ChangeEmailProps): React.JSX.Element {
  const initialState: ChangeEmailFormState = { message: undefined, errors: {}, status: 'idle' }
  const [actionState, action, isPending] = useActionState<ChangeEmailFormState, FormData>(
    changeEmail,
    initialState
  )
  const resolver = zodResolver(changeEmailSchema)
  const {
    register,
    formState: { errors, isValid },
    handleSubmit,
    setError,
    reset,
  } = useForm({ resolver, mode: 'onSubmit' })

  const handleOnCancelOrClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (onClose != null) onClose()
  }

  const handleOnSubmit = async (data: Record<string, any>): Promise<void> => {
    try {
      const formData = new FormData()
      for (const [key, value] of Object.entries(data)) {
        formData.append(key, value)
      }

      startTransition(() => {
        action(formData)
      })
    } catch (error) {
      console.error('Error occurred in handleOnSubmit:', error)
    }
  }

  useEffect(() => {
    if (actionState?.status === 'success') {
      reset()
      if (onSuccess != null) onSuccess(actionState.email)
    }
  }, [actionState?.status, reset, onSuccess, actionState?.email])

  type ErrorKeys = keyof ChangeEmailFormState['errors']

  useEffect(() => {
    if (actionState?.errors != null && Object.keys(actionState.errors).length > 0) {
      const fields = Object.keys(actionState.errors) as ErrorKeys[]
      for (const field of fields) {
        const errorMessage = getErrorText(field, null, actionState.errors)
        setError(field, { message: errorMessage })
      }
    }
  }, [actionState?.errors, setError])

  return (
    <div className="form flex flex-col gap-2 mt-[2vh]">
      {actionState?.status === 'success' && isPending === false && (
        <Alert intent="success">
          <span>{actionState.message}</span>
        </Alert>
      )}

      {actionState?.status === 'failed' && isPending === false && (
        <Alert intent="danger">
          <span>{actionState.message}</span>
        </Alert>
      )}

      <form action={action} onSubmit={handleSubmit(handleOnSubmit)} autoComplete="off" noValidate>
        <input type="hidden" {...register('id')} value={user?.id} />
        <input type="hidden" {...register('vid')} value={user?.vid} />
        <input type="hidden" {...register('lng')} value={lng} />
        <div className="mb-3">
          <Input
            required
            id="email"
            label="Email"
            defaultValue={user?.email ?? undefined}
            placeHolder="Email"
            helpText="Please enter an updated email address"
            error={!isValid && hasErrors('email', errors, null)}
            errorText={!isValid ? getErrorText('email', errors, null) : ''}
            {...register('email')}
          />
        </div>
        <div className="form-actions flex gap-2 mt-4">
          <Button intent="noeffect" onClick={handleOnCancelOrClose} type="button">
            Cancel
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending === true ? <LoaderEllipsis size={30} color="#AAAAAA" /> : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  )
}

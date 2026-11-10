import type React from 'react'
import { startTransition, useActionState, useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, LoaderEllipsis } from '@infonomic/uikit/react'
import { useForm } from 'react-hook-form'

import { getErrorText, hasErrors } from '@/utils/utils.forms'
import { setPasswordSchema } from '../@types'
import { setPassword } from '../set-password'
import type { ActionProps, SetPasswordFormState } from '../@types'

export const SetPassword: React.FC<ActionProps> = ({ user, lng, onClose, onSuccess }) => {
  const initialState: SetPasswordFormState = { message: undefined, errors: {}, status: 'idle' }
  const [actionState, action, isPending] = useActionState(setPassword, initialState)
  const resolver = zodResolver(setPasswordSchema)
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
      if (onSuccess != null) onSuccess(actionState.response)
    }
  }, [actionState?.status, reset, onSuccess, actionState?.response])

  type ErrorKeys = keyof SetPasswordFormState['errors']

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
            label="Password"
            id="password"
            type="password"
            required
            helpText="Please choose a password. Passwords must be at least 8 characters long and include one uppercase letter, one number, and one special character."
            error={!isValid && hasErrors('new_password', errors, null)}
            errorText={!isValid ? getErrorText('new_password', errors, null) : ''}
            {...register('password')}
          />
        </div>
        <div className="mb-3">
          <Input
            label="Confirm Password"
            id="confirm_password"
            type="password"
            required
            error={!isValid && hasErrors('confirm_password', errors, null)}
            errorText={!isValid ? getErrorText('confirm_password', errors, null) : ''}
            {...register('confirm_password')}
          />
        </div>
        <div className="form-actions flex gap-2 mt-6">
          <Button intent="noeffect" onClick={handleOnCancelOrClose} type="button">
            {actionState?.status === 'success' ? 'Close' : 'Cancel'}
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending === true ? <LoaderEllipsis size={30} color="#AAAAAA" /> : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  )
}

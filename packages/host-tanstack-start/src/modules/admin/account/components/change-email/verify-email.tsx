import type React from 'react'
import { startTransition, useActionState, useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, LoaderEllipsis } from '@infonomic/uikit/react'
import { useForm } from 'react-hook-form'

import { getErrorText, hasErrors } from '@/utils/utils.forms'
import { verifyEmailSchema } from '../../@types'
import { verifyEmail } from '../../change-email'
import type { ActionProps, VerifyEmailFormState } from '../../@types'

export const VerifyEmail: React.FC<ActionProps & { email: string }> = ({
  user,
  email,
  lng,
  onClose,
  onSuccess,
}) => {
  const initialState: VerifyEmailFormState = { message: undefined, errors: {}, status: 'idle' }
  const [actionState, action, isPending] = useActionState<VerifyEmailFormState, FormData>(
    verifyEmail,
    initialState
  )

  const resolver = zodResolver(verifyEmailSchema)
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

  type ErrorKeys = keyof VerifyEmailFormState['errors']

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
      {actionState?.status === 'idle' && isPending === false && (
        <Alert intent="info">
          <span>
            We&apos;ve sent you an email verification code to your new email address. Please enter
            the code in the verification code field below.
          </span>
        </Alert>
      )}

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
        <input type="hidden" {...register('lng')} value={lng} />
        <div className="mb-5">
          <Input
            name="email"
            type="email"
            id="email"
            label="Requested Email Address"
            disabled={true}
            readOnly={true}
            defaultValue={email}
            placeHolder="Email"
          />
        </div>
        <div className="mb-3">
          <Input
            label="Verification Code"
            id="verification_code"
            type="text"
            required
            helpText="Please enter the email verification code we sent to your new email address."
            error={!isValid && hasErrors('verification_code', errors, null)}
            errorText={!isValid ? getErrorText('verification_code', errors, null) : ''}
            {...register('verification_code')}
          />
        </div>
        <div className="form-actions flex gap-2 mt-4">
          <Button intent="noeffect" onClick={handleOnCancelOrClose} type="button">
            {actionState.status === 'success' ? 'Close' : 'Cancel'}
          </Button>
          {actionState.status !== 'success' && (
            <Button disabled={isPending} type="submit">
              {isPending === true ? <LoaderEllipsis size={30} color="#AAAAAA" /> : 'Submit'}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

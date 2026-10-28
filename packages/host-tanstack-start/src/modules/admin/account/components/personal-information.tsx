import type React from 'react'
import { startTransition, useActionState, useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, LoaderEllipsis } from '@infonomic/uikit/react'
import { useForm } from 'react-hook-form'

import { getErrorText, hasErrors } from '@/utils/utils.forms'
import { nameEditSchema } from '../@types'
import { editFullName } from '../edit-full-name'
import type { ActionProps, NameFormState } from '../@types'

export const PersonalInformation: React.FC<ActionProps> = ({ user, lng, onClose, onSuccess }) => {
  const initialState: NameFormState = { message: undefined, errors: {}, status: 'idle' }
  const [actionState, action, isPending] = useActionState(editFullName, initialState)
  const resolver = zodResolver(nameEditSchema)
  const {
    register,
    formState: { errors, isValid },
    handleSubmit,
    setError,
    reset,
  } = useForm({ resolver, mode: 'onSubmit' })

  const handleOnCancelOrClose = (_event: React.MouseEvent<HTMLButtonElement>) => {
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

  type ErrorKeys = keyof NameFormState['errors']

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
            id="given_name"
            label="Given Name"
            defaultValue={user?.given_name ?? undefined}
            placeHolder="Given Name"
            helpText="Please enter a given name"
            error={!isValid && hasErrors('given_name', errors, null)}
            errorText={!isValid ? getErrorText('given_name', errors, null) : ''}
            {...register('given_name')}
          />
        </div>
        <div className="mb-3">
          <Input
            required
            id="family_name"
            label="Family Name"
            defaultValue={user?.family_name ?? undefined}
            placeHolder="Family Name"
            helpText="Please enter a family name"
            error={!isValid && hasErrors('family_name', errors, null)}
            errorText={!isValid ? getErrorText('family_name', errors, null) : ''}
            {...register('family_name')}
          />
        </div>
        <div className="form-actions flex gap-2 mt-4">
          <Button intent="noeffect" onClick={handleOnCancelOrClose} type="button">
            Cancel
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending === true ? <LoaderEllipsis size={30} color="#AAAAAA" /> : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  )
}

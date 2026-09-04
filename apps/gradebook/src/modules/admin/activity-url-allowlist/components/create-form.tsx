'use client'

import { startTransition, useActionState, useEffect } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, LoaderEllipsis, TextArea } from '@infonomic/uikit/react'
import { useForm } from 'react-hook-form'

import { LangLink } from '@/i18n/components/lang-link'
import { useTheme } from '@/ui/theme/provider'
import { getErrorText, hasErrors } from '@/utils/utils.forms'
import { allowlistRuleCreateSchema } from '../@types'
import { createAllowlistRule } from '../create'
import { CollisionNotice } from './copy'
import { ReEnableRuleButton } from './re-enable-button'
import type { Locale } from '@/i18n/i18n-config'
import type { AllowlistRuleFormState } from '../@types'

export function AllowlistRuleCreateForm({ lng }: { lng: Locale }): React.JSX.Element {
  const { theme } = useTheme()
  const initialState: AllowlistRuleFormState = { message: undefined, errors: {}, status: 'idle' }
  const [formState, formAction, isPending] = useActionState(createAllowlistRule, initialState)
  const resolver = zodResolver(allowlistRuleCreateSchema)
  const {
    register,
    formState: { errors, isValid },
    handleSubmit,
    setError,
  } = useForm({ resolver, mode: 'onSubmit' })

  const handleOnSubmit = async (data: Record<string, any>): Promise<void> => {
    try {
      const formData = new FormData()
      for (const [key, value] of Object.entries(data)) {
        formData.append(key, value)
      }

      startTransition(() => {
        formAction(formData)
      })
    } catch (error) {
      console.error('Error occurred in handleOnSubmit:', error)
    }
  }

  type ErrorKeys = keyof AllowlistRuleFormState['errors']

  useEffect(() => {
    if (formState?.errors != null && Object.keys(formState.errors).length > 0) {
      const fields = Object.keys(formState.errors) as ErrorKeys[]
      for (const field of fields) {
        const errorMessage = getErrorText(field, null, formState.errors)
        setError(field, { message: errorMessage })
      }
    }
  }, [formState?.errors, setError])

  const collided = formState?.status === 'already_enabled' || formState?.status === 'disabled_match'

  return (
    <div className="max-w-[640px] mx-auto rounded-md border border-gray-100 dark:border-gray-700 p-5 pb-1 mb-8 mt-[4vh]">
      <h2 className="!m-0 !mb-4">Add Allowlist Rule</h2>

      {formState?.status === 'failed' && (
        <Alert intent="danger">
          <span>{formState.message}</span>
        </Alert>
      )}

      {collided && formState.existing != null && (
        <CollisionNotice
          status={formState.status as 'already_enabled' | 'disabled_match'}
          existing={formState.existing}
          action={
            formState.status === 'disabled_match' ? (
              <ReEnableRuleButton rule={formState.existing} />
            ) : undefined
          }
        />
      )}

      <form
        action={formAction}
        onSubmit={handleSubmit(handleOnSubmit)}
        autoComplete="off"
        noValidate
      >
        <Input
          required
          id="base_url"
          label="Base URL"
          placeHolder="https://ximera.osu.edu/course"
          helpText="An absolute URL. A bare origin allows the whole domain; a path allows that subtree only."
          error={!isValid && hasErrors('base_url', errors, null)}
          errorText={!isValid ? getErrorText('base_url', errors, null) : ''}
          {...register('base_url')}
        />
        <TextArea
          id="description"
          rows={3}
          label="Description"
          placeHolder="Why this base URL is trusted"
          helpText="Optional. Explain why this base URL is allowed, for whoever reads this next."
          error={!isValid && hasErrors('description', errors, null)}
          errorText={!isValid ? getErrorText('description', errors, null) : ''}
          {...register('description')}
        />

        <div className="form-actions flex gap-2 justify-end my-4">
          <Button
            className="min-w-[120px]"
            intent="noeffect"
            render={<LangLink href="/admin/activities" lng={lng} />}
          >
            Cancel
          </Button>
          <Button className="min-w-[120px]" disabled={isPending} type="submit">
            {isPending === true ? (
              <LoaderEllipsis color={theme === 'dark' ? '#000000' : '#FFFFFF'} size={42} />
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

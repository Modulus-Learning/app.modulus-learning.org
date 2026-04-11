'use client'

import { startTransition, useActionState, useEffect, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, Input, Label, LoaderEllipsis, Tabs } from '@infonomic/uikit/react'
import { useForm } from 'react-hook-form'

import { LangLink } from '@/i18n/components/lang-link'
import { useTheme } from '@/ui/theme/provider'
import { getErrorText, hasAnyErrors, hasErrors } from '@/utils/utils.forms'
import { roleCreateSchema } from '../@types'
import { createRole } from '../create'
import type { Locale } from '@/i18n/i18n-config'
import type { RoleFormState } from '../@types'

export function RoleCreateForm({ lng }: { lng: Locale }): React.JSX.Element {
  const { theme } = useTheme()
  const initialState: RoleFormState = { message: undefined, errors: {}, status: 'idle' }
  const [tab, setTab] = useState('detailsTab')
  const [formState, formAction, isPending] = useActionState(createRole, initialState)
  const resolver = zodResolver(roleCreateSchema)
  const {
    // control,
    register,
    formState: { errors, isValid },
    // setFocus,
    handleSubmit,
    setError,
    reset,
  } = useForm({ resolver, mode: 'onSubmit' })
  const [submitted, setSubmitted] = useState<boolean>(false)

  const handleOnTabChange = (value: string) => {
    setTab(value)
  }

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

  useEffect(() => {
    if (formState?.status === 'success' && submitted === false) {
      reset()
      setSubmitted(true)
      setTab('detailsTab')
      window.scrollTo(0, 100)
    }
  }, [formState?.status, submitted, reset])

  type ErrorKeys = keyof RoleFormState['errors']

  useEffect(() => {
    if (formState?.errors != null && Object.keys(formState.errors).length > 0) {
      const fields = Object.keys(formState.errors) as ErrorKeys[]
      for (const field of fields) {
        const errorMessage = getErrorText(field, null, formState.errors)
        setError(field, { message: errorMessage })
      }
    }
  }, [formState?.errors, setError])

  return (
    <div className="max-w-[500px] mx-auto rounded-md border border-gray-100 dark:border-gray-700 p-5 pb-1 mb-8 mt-[4vh]">
      <h2 className="!m-0 !mb-4">Create New Role</h2>
      {formState?.status === 'success' && (
        <Alert intent="success">
          <span>{formState.message}</span>
        </Alert>
      )}

      {formState?.status === 'failed' && (
        <Alert intent="danger">
          <span>{formState.message}</span>
        </Alert>
      )}

      <form
        action={formAction}
        onSubmit={handleSubmit(handleOnSubmit)}
        autoComplete="off"
        noValidate
      >
        <Tabs
          value={tab}
          onValueChange={handleOnTabChange}
          className="min-h-[255px] border-gray-100 dark:border-gray-700"
        >
          <Tabs.List className="grid w-full gap-2 grid-cols-2 mb-4">
            <Tabs.Trigger
              render={<Button variant={tab === 'detailsTab' ? 'filled' : 'outlined'} />}
              value="detailsTab"
            >
              Details
              {hasAnyErrors(['name', 'machine_name', 'description'], errors, null) ?? (
                <span className="text-red-600 dark:text-red-700">&nbsp;*</span>
              )}
            </Tabs.Trigger>
            <Tabs.Trigger
              render={<Button variant={tab === 'permissionsTab' ? 'filled' : 'outlined'} />}
              value="permissionsTab"
            >
              Permission
              {hasAnyErrors(['permissions'], errors, null) ?? (
                <span className="text-red-600 dark:text-red-700">Permissions &nbsp;*</span>
              )}
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="detailsTab" keepMounted={true}>
            <Input
              required
              id="name"
              label="Name"
              placeHolder="Name"
              helpText="Please enter a name"
              error={!isValid && hasErrors('name', errors, null)}
              errorText={!isValid ? getErrorText('name', errors, null) : ''}
              {...register('name')}
            />
            <Input
              required
              id="machine_name"
              label="Machine Name"
              placeHolder="Machine Name"
              helpText="Please enter a last name"
              error={!isValid && hasErrors('machine_name', errors, null)}
              errorText={!isValid ? getErrorText('machine_name', errors, null) : ''}
              {...register('machine_name')}
            />
            <Input
              id="description"
              label="Description"
              placeHolder="Description"
              helpText="Optionally enter a description"
              error={!isValid && hasErrors('description', errors, null)}
              errorText={!isValid ? getErrorText('description', errors, null) : ''}
              {...register('description')}
            />
          </Tabs.Content>
          <Tabs.Content value="permissionsTab">
            <div className="mb-3 mt-3">
              <Label
                required={true}
                className="mb-1"
                id="permissions-label"
                htmlFor="permissions"
                label="Permissions"
              />
              <div className="border dark:border-canvas-400 rounded-md p-3 mb-2">
                <p>Permissions here...</p>
              </div>
            </div>
          </Tabs.Content>
        </Tabs>

        <div className="form-actions flex gap-2 justify-end my-4">
          <Button
            className="min-w-[120px]"
            intent="noeffect"
            render={<LangLink href="/admin/roles" lng={lng} />}
          >
            {formState?.status === 'success' ? 'Close' : 'Cancel'}
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

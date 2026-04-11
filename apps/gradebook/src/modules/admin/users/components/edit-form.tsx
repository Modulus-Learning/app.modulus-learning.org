'use client'

import { startTransition, useActionState, useEffect, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  HelpText,
  Input,
  Label,
  LoaderEllipsis,
  Tabs,
} from '@infonomic/uikit/react'
import { Controller, useForm } from 'react-hook-form'

import { LangLink } from '@/i18n/components/lang-link'
import { useTheme } from '@/ui/theme/provider'
import { getErrorText, hasAnyErrors, hasErrors } from '@/utils/utils.forms'
import { userEditSchema } from '../@types'
import { editUser } from '../edit'
import type { Locale } from '@/i18n/i18n-config'
import type { UserFormState, UserResponse } from '../@types'

interface UserEditFormProps {
  lng: Locale
  data: UserResponse
}

export function UserEditForm({ data, lng }: UserEditFormProps): React.JSX.Element {
  const { theme } = useTheme()
  const initialState: UserFormState = { message: undefined, errors: {}, status: 'idle' }
  const [tab, setTab] = useState('detailsTab')
  const [formState, formAction, isPending] = useActionState(editUser, initialState)
  const resolver = zodResolver(userEditSchema)
  const {
    control,
    register,
    formState: { errors, isValid },
    setFocus,
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

  type ErrorKeys = keyof UserFormState['errors']

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
      <h2 className="!m-0 !mb-4">Edit User</h2>
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
        <input type="hidden" {...register('id')} value={data?.user?.id} />
        <input type="hidden" {...register('vid')} value={data?.user?.vid} />
        <input type="hidden" {...register('previous_roles')} value={data?.user?.roles.join(',')} />
        <Tabs
          value={tab}
          onValueChange={handleOnTabChange}
          className="min-h-[255px] border-gray-100 dark:border-gray-700"
        >
          <Tabs.List>
            <Tabs.Trigger
              render={<Button variant={tab === 'detailsTab' ? 'filled' : 'outlined'} />}
              value="detailsTab"
            >
              Details
              {hasAnyErrors(['full_name', 'email', 'password'], errors, null) ?? (
                <span className="text-red-600 dark:text-red-700">&nbsp;*</span>
              )}
            </Tabs.Trigger>
            <Tabs.Trigger
              render={<Button variant={tab === 'rolesTab' ? 'filled' : 'outlined'} />}
              value="rolesTab"
            >
              Roles
              {hasAnyErrors(['roles'], errors, null) ?? (
                <span className="text-red-600 dark:text-red-700">Roles &nbsp;*</span>
              )}
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="detailsTab" keepMounted={true} tabIndex={-1}>
            <Input
              required
              id="full_name"
              label="Full Name"
              defaultValue={data?.user?.full_name}
              placeHolder="Full Name"
              helpText="Please enter a full name"
              error={!isValid && hasErrors('full_name', errors, null)}
              errorText={!isValid ? getErrorText('full_name', errors, null) : ''}
              {...register('full_name')}
            />
            <Input
              required
              id="email"
              type="email"
              label="Email"
              placeHolder="Email"
              defaultValue={data?.user?.email ?? undefined}
              helpText="Please enter an email address"
              error={!isValid && hasErrors('email', errors, null)}
              errorText={!isValid ? getErrorText('email', errors, null) : ''}
              {...register('email')}
            />
            <Input
              label="Password"
              id="password"
              type="password"
              autoComplete="new-password"
              placeHolder="Updated password"
              helpText="Optionally update this user's password. Passwords must be at least 8 characters long and include one uppercase letter, one number, and one special character."
              error={errors?.password != null || formState?.errors?.password != null}
              errorText={!isValid ? getErrorText('password', errors, null) : ''}
              {...register('password')}
            />
            <div className="input-control mb-2 mt-3 pl-0">
              <Controller
                control={control}
                name="is_enabled"
                defaultValue={data?.user?.is_enabled}
                render={({ field: { onChange, value } }) => {
                  return (
                    <Checkbox
                      containerClasses="flex-row-reverse gap-4 justify-end"
                      labelClasses="ml-0"
                      id="is_enabled"
                      name="is_enabled"
                      checked={value as boolean}
                      label="Account Enabled"
                      onCheckedChange={(value) => {
                        onChange(value)
                      }}
                    />
                  )
                }}
              />
            </div>
          </Tabs.Content>
          <Tabs.Content value="rolesTab" keepMounted={true} tabIndex={-1}>
            <div className="mb-3 mt-3">
              <Label
                required={true}
                className="mb-1"
                id="roles-label"
                htmlFor="roles"
                label="Roles"
              />
              <div className="border dark:border-canvas-400 rounded-md p-3 mb-2">
                <Controller
                  control={control}
                  name="roles"
                  defaultValue={data?.user?.roles.join(',')}
                  render={({ field: { onChange, value } }) => {
                    return (
                      <CheckboxGroup
                        groupName="roles"
                        // TODO: Nullability of role.name
                        checkBoxes={data.included.roles.map((role) => ({
                          id: role.id,
                          label: role.name ?? '-',
                        }))}
                        controlledValue={value}
                        onChange={(selected) => {
                          const value = selected.join(',')
                          onChange(value)
                        }}
                      />
                    )
                  }}
                />
              </div>
              <HelpText text="Please select at least one role for this user." />
              {!isValid && hasErrors('roles', errors, null) === true && (
                <p className="mb-1 mt-1 text-sm text-red-700">
                  {getErrorText('roles', errors, null)}{' '}
                </p>
              )}
            </div>
          </Tabs.Content>
        </Tabs>

        <div className="form-actions flex gap-2 justify-end my-4">
          <Button
            className="min-w-[120px]"
            intent="noeffect"
            render={<LangLink href={`/admin/users/${data?.user?.id}`} lng={lng} />}
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

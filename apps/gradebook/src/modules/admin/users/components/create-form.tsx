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
import { userCreateSchema } from '../@types'
import { createUser } from '../create'
import type { Locale } from '@/i18n/i18n-config'
import type { Role, UserFormState } from '../@types'

export function UserCreateForm({ lng, roles }: { lng: Locale; roles: Role[] }): React.JSX.Element {
  const { theme } = useTheme()
  const initialState: UserFormState = { message: undefined, errors: {}, status: 'idle' }
  const [tab, setTab] = useState('detailsTab')
  const [formState, formAction, isPending] = useActionState(createUser, initialState)
  const resolver = zodResolver(userCreateSchema)
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
    <div className="max-w-[500px] mx-auto rounded-md border border-gray-100 dark:border-gray-700 p-5 mb-8 mt-[4vh]">
      <h2 className="!m-0 !mb-4">Create New User</h2>
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
          <Tabs.Content value="detailsTab" keepMounted={true}>
            <Input
              required
              id="full_name"
              label="Full Name"
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
              autoComplete="new-password"
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
              placeHolder="Password"
              required
              helpText="Please choose a password. Passwords must be at least 8 characters long and include one uppercase letter, one number, and one special character."
              error={errors?.password != null || formState?.errors?.password != null}
              errorText={!isValid ? getErrorText('password', errors, null) : ''}
              {...register('password')}
            />
          </Tabs.Content>
          <Tabs.Content value="rolesTab">
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
                  // defaultValue="0193b1f7-9b9b-734d-a7aa-0255e363b4ef"
                  render={({ field: { onChange, value } }) => {
                    return (
                      <CheckboxGroup
                        groupName="roles"
                        // TODO: Nullablilty of role.name
                        checkBoxes={roles.map((role) => ({ id: role.id, label: role.name ?? '-' }))}
                        // defaultValues={['0193b1f7-9b9b-734d-a7aa-0255e363b4ef']}
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
            render={<LangLink href="/admin/users" lng={lng} />}
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
        <div className="input-control mr-1">
          <Controller
            control={control}
            name="send_welcome"
            render={({ field: { onChange, value } }) => (
              <Checkbox
                containerClasses="flex-row-reverse justify-end"
                labelClasses="ml-auto mr-4 text-sm"
                id="send_welcome"
                name="send_welcome"
                label="Send welcome email"
                checked={value as boolean}
                onCheckedChange={(checked) => onChange(checked)}
              />
            )}
          />
        </div>
      </form>
    </div>
  )
}

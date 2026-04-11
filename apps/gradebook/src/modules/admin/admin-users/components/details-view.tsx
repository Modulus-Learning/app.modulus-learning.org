'use client'

import { startTransition, useActionState, useState } from 'react'

import { Alert, Button, Checkbox, CheckboxGroup, Input, Label, Tabs } from '@infonomic/uikit/react'

import { LangLink } from '@/i18n/components/lang-link'
import { useTheme } from '@/ui/theme/provider'
import { deleteAdminUser } from '../delete'
import { AdminUserContextMenu } from './context-menu'
import type { Locale } from '@/i18n/i18n-config'
import type { AdminUserDeleteState, AdminUserResponse } from '../@types'

interface UserDetailsProps {
  lng: Locale
  data: AdminUserResponse
  mode: 'view' | 'delete'
}

export function AdminUserDetailsView({ lng, data, mode }: UserDetailsProps): React.JSX.Element {
  const { theme } = useTheme()
  const [tab, setTab] = useState('detailsTab')
  const initialState: AdminUserDeleteState = { message: undefined, status: 'idle' }
  const [formState, formAction, _isPending] = useActionState(deleteAdminUser, initialState)

  const handleOnTabChange = (value: string) => {
    setTab(value)
  }

  const handleOnDeleteSubmit = async (): Promise<void> => {
    try {
      if (data?.user?.id != null) {
        const formData = new FormData()
        formData.append('userId', data.user.id)
        formData.append('given_name', data.user.given_name)
        formData.append('family_name', data.user.family_name)
        startTransition(() => {
          formAction(formData)
        })
      }
    } catch (error) {
      console.error('Error occurred in handleOnSubmit:', error)
    }
  }

  return (
    <div className="max-w-[500px] mx-auto rounded-md border border-gray-100 dark:border-gray-700 px-5 pb-1 mb-8 mt-[4vh]">
      <div className="user-context-menu py-3 mb-2 flex items-center justify-start">
        <h2 className="!m-0 !mr-auto">
          {mode === 'delete' ? 'Delete Admin User' : 'Admin User Details'}
        </h2>
        <AdminUserContextMenu lng={lng} data={data} mode={mode} />
      </div>
      {mode === 'delete' && formState.status === 'idle' && (
        <Alert intent="danger" close={false}>
          <span>Warning: This action cannot be undone.</span>
        </Alert>
      )}
      {mode === 'delete' && formState.status === 'failed' && (
        <Alert intent="danger" close={false}>
          <span>Error: An error occurred.</span>
        </Alert>
      )}
      <Tabs
        value={tab}
        onValueChange={handleOnTabChange}
        className="min-h-[235px] border-gray-100 dark:border-gray-700"
      >
        <Tabs.List className="grid w-full gap-2 grid-cols-2 mb-4">
          <Tabs.Trigger
            render={<Button variant={tab === 'detailsTab' ? 'filled' : 'outlined'} />}
            value="detailsTab"
          >
            Details
          </Tabs.Trigger>
          <Tabs.Trigger
            render={<Button variant={tab === 'rolesTab' ? 'filled' : 'outlined'} />}
            value="rolesTab"
          >
            Roles
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="detailsTab" keepMounted={true}>
          <div className="input-control mb-2">
            <Input
              name="given_name"
              defaultValue={data?.user?.given_name}
              id="given_name"
              label="Given Name"
              readOnly={true}
            />
          </div>
          <div className="input-control mb-2">
            <Input
              name="family_name"
              defaultValue={data?.user?.family_name}
              id="family_name"
              label="Family Name"
              readOnly={true}
            />
          </div>
          <div className="input-control mb-2">
            <Input
              id="email"
              name="email"
              defaultValue={data?.user?.email}
              type="email"
              label="Email"
              readOnly={true}
            />
          </div>
          <div className="input-control mb-2 mt-6 pl-1">
            <Checkbox
              containerClasses="flex-row-reverse gap-4 justify-end"
              labelClasses="ml-0"
              id="is_enabled"
              name="is_enabled"
              checked={data?.user?.is_enabled}
              label="Account Enabled"
              disabled={true}
            />
          </div>
        </Tabs.Content>
        <Tabs.Content value="rolesTab">
          <div className="mb-3 mt-3">
            <Label className="mb-1" id="roles-label" htmlFor="roles" label="Roles" />
            <div className="border dark:border-canvas-400 rounded-md p-3 mb-2">
              <CheckboxGroup
                groupName="roles"
                disabled={true}
                // TODO: Fix the next line once role.name is no longer nullable
                checkBoxes={data?.included?.roles?.map((role) => ({
                  id: role.id,
                  label: role.name ?? role.machine_name,
                }))}
                defaultValues={data?.user?.roles}
              />
            </div>
          </div>
        </Tabs.Content>
      </Tabs>

      <div className="form-actions flex gap-2 justify-end my-4">
        <Button
          intent="noeffect"
          render={
            <LangLink
              href={
                mode === 'delete' ? `/admin/admin-users/${data?.user?.id}` : '/admin/admin-users'
              }
              lng={lng}
            />
          }
        >
          {mode === 'delete' ? 'Cancel' : 'Close'}
        </Button>
        {mode === 'delete' && (
          <Button
            intent="danger"
            variant={theme === 'dark' ? 'outlined' : 'filled'}
            onClick={handleOnDeleteSubmit}
          >
            Delete User
          </Button>
        )}
      </div>
    </div>
  )
}

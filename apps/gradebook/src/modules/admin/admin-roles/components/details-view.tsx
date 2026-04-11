'use client'

import { startTransition, useActionState, useState } from 'react'

import { Alert, Button, Input, Label, Tabs } from '@infonomic/uikit/react'

import { LangLink } from '@/i18n/components/lang-link'
import { useTheme } from '@/ui/theme/provider'
import { deleteAdminRole } from '../delete'
import { AdminRoleContextMenu } from './context-menu'
import type { Locale } from '@/i18n/i18n-config'
import type { AdminRoleDeleteState, AdminRoleResponse } from '../@types'

interface UserDetailsProps {
  lng: Locale
  data: AdminRoleResponse
  mode: 'view' | 'delete'
}

export function AdminRoleDetailsView({ lng, data, mode }: UserDetailsProps): React.JSX.Element {
  const { theme } = useTheme()
  const [tab, setTab] = useState('detailsTab')
  const initialState: AdminRoleDeleteState = { message: undefined, status: 'idle' }
  const [formState, formAction, _isPending] = useActionState(deleteAdminRole, initialState)

  const handleOnTabChange = (value: string) => {
    setTab(value)
  }

  const handleOnDeleteSubmit = async (): Promise<void> => {
    try {
      if (data.role != null) {
        const formData = new FormData()
        formData.append('roleId', data.role.id)
        formData.append('name', data.role.name)
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
      <div className="py-3 mb-2 flex items-center justify-start">
        <h2 className="!m-0 !mr-auto">
          {mode === 'delete' ? 'Delete  Admin Role' : ' Admin Role Details'}
        </h2>
        <AdminRoleContextMenu lng={lng} data={data} mode={mode} />
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
            render={<Button variant={tab === 'permissionsTab' ? 'filled' : 'outlined'} />}
            value="permissionsTab"
          >
            Permission
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="detailsTab" keepMounted={true}>
          <div className="input-control mb-2">
            <Input
              name="name"
              defaultValue={data.role?.name}
              id="name"
              label="Name"
              readOnly={true}
            />
          </div>
          <div className="input-control mb-2">
            <Input
              name="machine_name"
              defaultValue={data.role?.machine_name}
              id="machine_name"
              label="Machine Name"
              readOnly={true}
            />
          </div>
          <div className="input-control mb-2">
            <Input
              id="description"
              name="description"
              defaultValue={data.role?.description ?? undefined}
              type="description"
              label="Description"
              readOnly={true}
            />
          </div>
        </Tabs.Content>
        <Tabs.Content value="permissionsTab" keepMounted={true}>
          <div className="mb-3 mt-3">
            <Label
              className="mb-1"
              id="permissions-label"
              htmlFor="permissions"
              label="Permissions"
            />
            <div className="border dark:border-canvas-400 rounded-md p-3 mb-2">
              <div className="component--scroller max-h-[300px]">
                {data.permissions?.map((permission) => (
                  <div key={permission.id} className="flex items-center mb-1">
                    {permission.ability}
                  </div>
                ))}
              </div>
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
                mode === 'delete' ? `/admin/admin-roles/${data.role?.id}` : '/admin/admin-roles'
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
            Delete Admin Role
          </Button>
        )}
      </div>
    </div>
  )
}

'use client'

import {
  DeleteIcon,
  Dropdown as DropdownMenu,
  EditIcon,
  EllipsisIcon,
  IconButton,
} from '@infonomic/uikit/react'
import cx from 'classnames'

import { LangLink } from '@/i18n/components/lang-link'
import type { Locale } from '@/i18n/i18n-config'
import type { AdminRoleResponse } from '../@types'

const menuItemClasses = cx(
  'flex gap-1 w-full rounded px-[2px] py-[5px] md:text-sm',
  'hover:bg-canvas-50/30 dark:hover:bg-canvas-900',
  'cursor-default select-none items-center outline-none',
  'text-gray-600 focus:bg-canvas-50/30 dark:text-gray-300 dark:focus:bg-canvas-900'
)

interface AdminRoleContextMenuProps {
  lng: Locale
  data: AdminRoleResponse
  mode: 'view' | 'delete'
}

export function AdminRoleContextMenu({
  lng,
  data,
  mode,
}: AdminRoleContextMenuProps): React.JSX.Element {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger render={<IconButton variant="text" size="sm" />}>
        <EllipsisIcon />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={0}
          className={cx(
            'z-40 rounded radix-side-bottom:animate-slide-down radix-side-top:animate-slide-up',
            'w-28 px-1.5 py-1 shadow-md',
            'bg-white dark:bg-canvas-800 border dark:border-canvas-700 shadow'
          )}
        >
          <DropdownMenu.Item className={menuItemClasses}>
            <LangLink
              href={`/admin/admin-roles/${data?.role?.id}/edit`}
              lng={lng}
              className="flex w-full items-center gap-1"
            >
              <span className="inline-block w-[22px]">
                <EditIcon width="18px" height="18px" />
              </span>
              <span className="text-left inline-block w-full flex-1 self-start text-black dark:text-gray-300">
                Edit
              </span>
            </LangLink>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 border-t border-t-gray-300 dark:border-t-gray-700 w-[90%] mx-auto" />
          <DropdownMenu.Item className={menuItemClasses}>
            <LangLink
              href={`/admin/admin-roles/${data?.role?.id}/delete`}
              lng={lng}
              className="flex w-full items-center gap-1"
            >
              <div className="flex items-center gap-1">
                <span className="inline-block w-[22px]">
                  <DeleteIcon
                    width="18px"
                    height="18px"
                    svgClassName="stroke-red-600 dark:stroke-red-600"
                  />
                </span>
                <span className="text-left inline-block w-full flex-1 self-start text-red-600">
                  Delete
                </span>
              </div>
            </LangLink>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

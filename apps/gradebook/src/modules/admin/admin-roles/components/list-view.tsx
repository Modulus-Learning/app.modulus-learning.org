'use client'

import type React from 'react'
import { type FormEvent, startTransition, useActionState, useEffect, useState } from 'react'

import {
  Button,
  Container,
  GripperVerticalIcon,
  IconButton,
  LoaderEllipsis,
  LoaderRing,
  PlusIcon,
  Section,
  Table,
} from '@infonomic/uikit/react'
import cx from 'classnames'

import { useProgressBarContext } from '@/context/progress-bar-provider'
import { LangLink } from '@/i18n/components/lang-link'
import {
  TableHeadingCellSortable,
  type TableHeadingCellSortableProps,
} from '@/ui/components/th-sortable'
import { DraggableSortable, moveItem, useSortable } from '@/ui/dnd/draggable-sortable'
import { formatDateTime, formatNumber } from '@/utils/utils.general'
import { orderAdminRoles } from '../order'
import type { Locale } from '@/i18n/i18n-config'
import type { AdminRole, AdminRoleOrderState, AdminRolesResponse } from '../@types'

const tableColumnDefs: Omit<TableHeadingCellSortableProps, 'lng'>[] = [
  {
    fieldName: 'name',
    label: 'Name',
    path: '/admin/admin-roles',
    sortable: false,
    scope: 'col',
    align: 'left',
    className: 'w-[18%]',
  },
  {
    fieldName: 'machine_name',
    label: 'Machine Name',
    path: '/admin/admin-roles',
    sortable: false,
    scope: 'col',
    align: 'left',
    className: 'w-[20%]',
  },
  {
    fieldName: 'description',
    label: 'Description',
    scope: 'col',
    align: 'left',
    className: 'w-[40%]',
  },
  {
    fieldName: 'created_at',
    label: 'Created',
    path: '/admin/admin-roles',
    sortable: false,
    scope: 'col',
    align: 'right',
    className: 'w-[20%]',
  },
]

function Stats({ total }: { total?: number }) {
  const progress = useProgressBarContext()
  const [showLoader, setShowLoader] = useState(false)

  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    if (progress.loading === true) {
      timeoutId = setTimeout(() => {
        setShowLoader(true)
      }, 200)
    } else {
      setShowLoader(false)
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [progress.loading])

  if (showLoader) {
    return <LoaderRing className="mr-auto -mb-[4px]" size={24} color="#666666" />
  }
  return (
    <span
      className={cx(
        'flex items-center justify-center mr-auto h-[28px] min-w-[28px] px-[6px] py-[5px] -mb-[4px]',
        'whitespace-nowrap text-sm leading-0',
        'bg-gray-25 dark:bg-canvas-700 border rounded-md'
      )}
    >
      {total != null ? formatNumber(total as number, 0) : '0'}
    </span>
  )
}

type DraggableRowProps = {
  item: AdminRole
  isSortable: boolean
  disabled: boolean
  lng: Locale
}

const DraggableRow: React.FC<DraggableRowProps> = ({ item, disabled, isSortable = true, lng }) => {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    disabled,
    transition: {
      duration: 250,
      easing: 'cubic-bezier(0, 0.2, 0.2, 1)',
    },
  })

  return (
    <Table.Row
      ref={setNodeRef as any}
      style={{
        // @ts-expect-error
        transform: transform && `translate3d(${transform.x}px, ${transform.y}px, 0)`, // translate3d is faster than translate in most browsers
        transition,
        zIndex: isDragging ? '10' : 'auto',
      }}
    >
      <Table.Cell>
        <div {...attributes} {...listeners}>
          <GripperVerticalIcon />
        </div>
      </Table.Cell>
      <Table.Cell>
        <LangLink href={`/admin/admin-roles/${item.id}`} lng={lng}>
          {item.name}
        </LangLink>
      </Table.Cell>
      <Table.Cell>{item.machine_name}</Table.Cell>
      <Table.Cell>{item.description}</Table.Cell>
      <Table.Cell className="text-right">{formatDateTime(item.created_at)}</Table.Cell>
    </Table.Row>
  )
}

function padRows(value: number) {
  return Array.from({ length: value }).map((_, index) => (
    <div key={`empty-row-${index}`} className="h-[32px] border-none">
      &nbsp;
    </div>
  ))
}

export function AdminRolesListView({ data, lng }: { data: AdminRolesResponse; lng: Locale }) {
  const initialState: AdminRoleOrderState = { message: undefined, status: 'idle' }
  const [_formState, formAction, isPending] = useActionState(orderAdminRoles, initialState)
  const [items, setItems] = useState(data?.roles ?? [])
  const [orderChanged, setOrderChanged] = useState(false)
  const handleOnDragEnd = ({
    event,
    moveFromIndex,
    moveToIndex,
  }: {
    event: any
    moveFromIndex: number
    moveToIndex: number
  }) => {
    const newItems = moveItem(items, moveFromIndex, moveToIndex)
    setItems(newItems)
    setOrderChanged(true)
  }

  function handleOnSubmit(_event: FormEvent<HTMLFormElement>): void {
    try {
      const formData = new FormData()
      formData.append('ids', items.map((role) => role.id).join(','))
      startTransition(() => {
        formAction(formData)
        setOrderChanged(false)
      })
    } catch (error) {
      console.error('Error occurred in handleOnSubmit:', error)
    }
  }

  return (
    <Section>
      <Container>
        <div className="flex items-center gap-3 py-[2px]">
          <h1 className="!m-0 pb-[2px]">Admin Roles</h1>
          <Stats total={data?.roles?.length} />
          <IconButton
            aria-label="Create New User"
            render={<LangLink href="/admin/admin-roles/add" lng={lng} />}
          >
            <PlusIcon height="18px" width="18px" svgClassName="stroke-white dark:stroke-black" />
          </IconButton>
        </div>
        {items == null || items.length === 0 ? (
          <div className="caption-bottom text-center mt-[6vh]">No admin roles found</div>
        ) : (
          <DraggableSortable
            ids={items.map((item) => item.id)}
            onDragEnd={handleOnDragEnd}
            className=""
          >
            <Table.Container className="mt-2 mb-3">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeadingCell className="p-2 w-[2%]" />
                    {tableColumnDefs.map((column) => {
                      return (
                        <TableHeadingCellSortable
                          key={column.fieldName}
                          lng={lng}
                          {...column}
                          ref={undefined}
                        />
                      )
                    })}
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {items.map((role) => {
                    return (
                      <DraggableRow
                        key={role.id}
                        item={role}
                        isSortable={true}
                        disabled={false}
                        lng={lng}
                      />
                    )
                  })}
                </Table.Body>
              </Table>
              {padRows(6 - (data?.roles?.length ?? 0))}
            </Table.Container>
          </DraggableSortable>
        )}
        <div className="pr-1 py-1">
          <form
            onSubmit={handleOnSubmit}
            action={formAction}
            autoComplete="off"
            noValidate
            className="flex w-full flex-col"
          >
            {orderChanged === true && (
              <div className="form-actions flex justify-end gap-2">
                <Button type="submit" size="sm" disabled={!orderChanged}>
                  {isPending === true ? (
                    <LoaderEllipsis size={30} color="#aaaaaa" />
                  ) : (
                    <span>Save</span>
                  )}
                </Button>
              </div>
            )}
          </form>
        </div>
      </Container>
    </Section>
  )
}

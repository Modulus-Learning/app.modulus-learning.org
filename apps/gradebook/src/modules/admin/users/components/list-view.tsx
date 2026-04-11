'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import {
  Container,
  IconButton,
  LoaderRing,
  PlusIcon,
  Search,
  Section,
  Select,
  Table,
} from '@infonomic/uikit/react'
import cx from 'classnames'

import { useProgressBarContext } from '@/context/progress-bar-provider'
import { LangLink } from '@/i18n/components/lang-link'
import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { RouterPager } from '@/ui/components/router-pager'
import {
  TableHeadingCellSortable,
  type TableHeadingCellSortableProps,
} from '@/ui/components/th-sortable'
import { formatDateTime, formatNumber } from '@/utils/utils.general'
import type { Locale } from '@/i18n/i18n-config'
import type { UsersResponse } from '../@types'

const tableColumnDefs: Omit<TableHeadingCellSortableProps, 'lng'>[] = [
  {
    fieldName: 'full_name',
    label: 'Full Name',
    path: '/admin/users',
    sortable: true,
    scope: 'col',
    align: 'left',
    className: 'w-[30%]',
  },
  {
    fieldName: 'email',
    label: 'Email',
    path: '/admin/users',
    sortable: true,
    scope: 'col',
    align: 'left',
    className: 'w-[30%]',
  },
  {
    fieldName: 'roles',
    label: 'Roles',
    sortable: false,
    scope: 'col',
    align: 'left',
    className: 'w-[20%]',
  },
  {
    fieldName: 'created_at',
    label: 'Created',
    path: '/admin/users',
    sortable: true,
    scope: 'col',
    align: 'right',
    className: 'w-[20%]',
  },
]

function Stats({ total }: { total: number }) {
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
      {formatNumber(total as number, 0)}
    </span>
  )
}

function padRows(value: number) {
  return Array.from({ length: value }).map((_, index) => (
    <div
      key={`empty-row-${
        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
        index
      }`}
      className="h-[32px] border-none"
    >
      &nbsp;
    </div>
  ))
}

export function UsersListView({ data, lng }: { data: UsersResponse; lng: Locale }) {
  const { navigate } = useLangNavigation(lng)
  const readOnlySearchParams = useSearchParams()
  const searchParams = new URLSearchParams(readOnlySearchParams)

  const handleOnSearch = (query: string): void => {
    if (query != null && query.length > 0) {
      searchParams.delete('page')
      searchParams.set('query', query)
      navigate({ href: `/admin/users?${searchParams?.toString()}` as string, scroll: false })
    }
  }

  const handleOnClear = (): void => {
    searchParams.delete('page')
    searchParams.delete('query')
    navigate({ href: `/admin/users?${searchParams?.toString()}` as string, scroll: false })
  }

  function handleOnRoleChange(value: unknown): void {
    const v = value as string
    if (v != null && v.length > 0) {
      searchParams.delete('page')
      searchParams.set('role', v)
      navigate({ href: `/admin/users?${searchParams?.toString()}` as string, scroll: false })
    }
  }

  function handleOnPageSizeChange(value: unknown): void {
    const v = value as string
    if (v != null && v.length > 0) {
      searchParams.delete('page')
      searchParams.set('page_size', v)
      navigate({
        href: `/admin/users?${searchParams?.toString()}` as string,
        scroll: true,
        smoothScrollToTop: true,
      })
    }
  }

  return (
    <Section>
      <Container>
        <div className="flex items-center gap-3 py-[2px]">
          <h1 className="!m-0 pb-[2px]">Users</h1>
          <Stats total={data.meta.total} />
          <IconButton
            aria-label="Create New User"
            render={<LangLink href="/admin/users/add" lng={lng} />}
          >
            <PlusIcon height="18px" width="18px" svgClassName="stroke-white dark:stroke-black" />
          </IconButton>
        </div>
        <div className="options flex flex-col gap-2 sm:flex-row items-start sm:items-center mt-3 mb-3">
          <Search
            onSearch={handleOnSearch}
            onClear={handleOnClear}
            inputSize="sm"
            placeholder="Search"
            className="mr-auto w-full max-w-[350px]"
          />
          <Select
            id="role"
            name="role"
            size="sm"
            defaultValue="all"
            onValueChange={handleOnRoleChange}
            items={[
              { value: 'all', label: 'All' },
              { value: 'learner', label: 'Learners' },
              { value: 'instructor', label: 'Instructors' },
            ]}
          />

          <RouterPager
            lng={lng}
            page={data.meta.page}
            count={data.meta.total_pages}
            showFirstButton
            showLastButton
            componentName="pagerTop"
            aria-label="Top Pager"
          />
        </div>
        <Table.Container className="mt-2 mb-3">
          <Table>
            <Table.Header>
              <Table.Row>
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
              {data?.users?.map((user) => {
                return (
                  <Table.Row key={user.id} className={user.is_enabled ? '' : 'text-red-500'}>
                    <Table.Cell>
                      <LangLink href={`/admin/users/${user.id}`} lng={lng}>
                        {user.full_name ?? '------'}
                      </LangLink>
                    </Table.Cell>
                    <Table.Cell>{user.email}</Table.Cell>
                    <Table.Cell>{user.roles.join(',')}</Table.Cell>
                    <Table.Cell className="text-right">
                      {formatDateTime(user.created_at)}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
          {padRows(6 - (data?.users?.length ?? 0))}
        </Table.Container>
        <div className="options flex flex-col gap-2 sm:flex-row items-start sm:items-center mb-5">
          <Select
            containerClassName="sm:ml-auto"
            id="page_size"
            name="page_size"
            size="sm"
            defaultValue="15"
            onValueChange={handleOnPageSizeChange}
            items={[
              { value: '15', label: '15' },
              { value: '30', label: '30' },
              { value: '50', label: '50' },
              { value: '100', label: '100' },
            ]}
          />
          <RouterPager
            smoothScrollToTop={true}
            lng={lng}
            page={data.meta.page}
            count={data.meta.total_pages}
            showFirstButton
            showLastButton
            componentName="pagerBottom"
            aria-label="Bottom Pager"
          />
        </div>
      </Container>
    </Section>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { Container, LoaderRing, Search, Section, Select, Table } from '@infonomic/uikit/react'
import cx from 'classnames'

import { useProgressBarContext } from '@/context/progress-bar-provider'
import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { RouterPager } from '@/ui/components/router-pager'
import {
  TableHeadingCellSortable,
  type TableHeadingCellSortableProps,
} from '@/ui/components/th-sortable'
import { formatDateTime, formatNumber } from '@/utils/utils.general'
import type { Locale } from '@/i18n/i18n-config'
import type { ProgressResponse } from '../@types'

const getTableColumnDefs = (path: string): Omit<TableHeadingCellSortableProps, 'lng'>[] => {
  return [
    {
      fieldName: 'full_name',
      label: 'Full Name',
      path,
      sortable: true,
      scope: 'col',
      align: 'left',
      className: 'w-[20%]',
    },
    {
      fieldName: 'progress',
      label: 'Progress',
      sortable: true,
      path,
      scope: 'col',
      align: 'left',
      className: 'w-[5%]',
    },
    {
      fieldName: 'activity_name',
      label: 'Activity Name',
      sortable: false,
      scope: 'col',
      align: 'left',
      className: 'w-[15%]',
    },
    {
      fieldName: 'activity_url',
      label: 'Activity URL',
      sortable: false,
      scope: 'col',
      align: 'left',
      className: 'w-[40%]',
    },
    {
      fieldName: 'updated_at',
      label: 'Updated',
      path,
      sortable: true,
      scope: 'col',
      align: 'right',
      className: 'w-[20%]',
    },
  ]
}

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

export function LearnersProgressView({ data, lng }: { data: ProgressResponse; lng: Locale }) {
  const { navigate } = useLangNavigation(lng)
  const readOnlySearchParams = useSearchParams()
  const searchParams = new URLSearchParams(readOnlySearchParams)

  const handleOnSearch = (query: string): void => {
    if (query != null && query.length > 0) {
      searchParams.delete('page')
      searchParams.set('query', query)
      navigate({
        href: `/dashboard/activity-code/${data?.included?.activity_code?.id}/learners?${searchParams?.toString()}` as string,
        scroll: false,
      })
    }
  }

  const handleOnClear = (): void => {
    searchParams.delete('page')
    searchParams.delete('query')
    navigate({
      href: `/dashboard/activity-code/${data?.included?.activity_code?.id}/learners?${searchParams?.toString()}` as string,
      scroll: false,
    })
  }

  function handleOnPageSizeChange(value: unknown): void {
    const v = value as string
    if (v != null && v.length > 0) {
      searchParams.delete('page')
      searchParams.set('page_size', v)
      navigate({
        href: `/dashboard/activity-code/${data?.included?.activity_code?.id}/learners?${searchParams?.toString()}` as string,
        scroll: true,
        smoothScrollToTop: true,
      })
    }
  }

  return (
    <Section>
      <Container>
        <div className="flex items-center gap-3 py-[2px]">
          <h1 className="!m-0 pb-[2px]">{data?.included?.activity_code?.code}</h1>
          <Stats total={data.meta.total} />
        </div>
        <div className="options flex flex-col gap-2 sm:flex-row items-start sm:items-center mt-3 mb-3">
          <Search
            onSearch={handleOnSearch}
            onClear={handleOnClear}
            inputSize="sm"
            placeholder="Search"
            className="mr-auto w-full max-w-[350px]"
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
                {getTableColumnDefs(
                  `/dashboard/metrics/${data?.included?.activity_code?.id}/learners`
                ).map((column) => {
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
              {data?.progress?.map((progress) => {
                return (
                  <Table.Row key={`${progress.user_id}:${progress.activity_url}`}>
                    <Table.Cell>{progress.full_name}</Table.Cell>
                    <Table.Cell>{progress.progress}</Table.Cell>
                    <Table.Cell>{progress.activity_name}</Table.Cell>
                    <Table.Cell style={{ overflowWrap: 'anywhere' }}>
                      <a href={progress.activity_url} target="_blank" rel="noopener noreferrer">
                        {progress.activity_url}
                      </a>
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {progress.created_at == null ? '-' : formatDateTime(progress.created_at)}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
          {padRows(6 - (data?.progress?.length ?? 0))}
        </Table.Container>
        <div className="options flex flex-col gap-2 sm:flex-row items-start sm:items-center mb-5">
          {/** biome-ignore lint/correctness/useUniqueElementIds: id is fine here */}
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

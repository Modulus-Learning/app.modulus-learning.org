'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import {
  Button,
  Container,
  CopyButton,
  LoaderRing,
  Search,
  Section,
  Table,
} from '@infonomic/uikit/react'
import cx from 'classnames'

import { usePublicConfig } from '@/config/provider'
import { useProgressBarContext } from '@/context/progress-bar-provider'
import { LangLink } from '@/i18n/components/lang-link'
import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
// import { RouterPager } from '@/ui/components/router-pager'
import {
  TableHeadingCellSortable,
  type TableHeadingCellSortableProps,
} from '@/ui/components/th-sortable'
import { formatDateTime, formatNumber } from '@/utils/utils.general'
import type { Locale } from '@/i18n/i18n-config'
import type { Activity, ActivityCode } from '../@types'

const getTableColumnDefs = (path: string): Omit<TableHeadingCellSortableProps, 'lng'>[] => {
  return [
    {
      fieldName: 'url',
      label: 'URL',
      path,
      sortable: true,
      scope: 'col',
      align: 'left',
      className: 'w-[30%]',
    },
    {
      label: 'Launch',
      sortable: false,
      path,
      scope: 'col',
      align: 'left',
      className: 'w-[30%]',
    },
    {
      fieldName: 'name',
      label: 'Name',
      sortable: true,
      path,
      scope: 'col',
      align: 'left',
      className: 'w-[10%]',
    },
    {
      fieldName: 'created_at',
      label: 'Created',
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

export function ActivitiesView({
  activityCode,
  activities,
  lng,
}: {
  activityCode: ActivityCode
  activities: Activity[]
  lng: Locale
}) {
  const config = usePublicConfig()
  const { navigate } = useLangNavigation(lng)
  const readOnlySearchParams = useSearchParams()
  const searchParams = new URLSearchParams(readOnlySearchParams)

  const handleOnSearch = (query: string): void => {
    if (query != null && query.length > 0) {
      searchParams.delete('page')
      searchParams.set('query', query)
      navigate({
        href: `/dashboard/activity-code/${activityCode?.id}/activities?${searchParams?.toString()}` as string,
        scroll: false,
      })
    }
  }

  const handleOnClear = (): void => {
    searchParams.delete('page')
    searchParams.delete('query')
    navigate({
      href: `/dashboard/activity-code/${activityCode?.id}/activities?${searchParams?.toString()}` as string,
      scroll: false,
    })
  }

  function _handleOnPageSizeChange(value: string): void {
    if (value != null && value.length > 0) {
      searchParams.delete('page')
      searchParams.set('page_size', value)
      navigate({
        href: `/dashboard/activity-code/${activityCode?.id}/activities?${searchParams?.toString()}` as string,
        scroll: true,
        smoothScrollToTop: true,
      })
    }
  }

  return (
    <Section>
      <Container>
        <div className="flex items-center gap-3 py-[4px]">
          <h1>{activityCode?.code}</h1>
          <Stats total={activities.length} />
          <Button
            render={
              <LangLink href={`/dashboard/activity-code/${activityCode?.id}/activities/edit`} />
            }
            size="sm"
            variant="outlined"
            className="mt-1 min-w-[100px]"
          >
            Edit
          </Button>
        </div>
        <div className="options flex flex-col gap-2 sm:flex-row items-start sm:items-center mt-3 mb-3">
          <Search
            onSearch={handleOnSearch}
            onClear={handleOnClear}
            inputSize="sm"
            placeholder="Search"
            className="mr-auto w-full max-w-[350px]"
          />

          {/* <RouterPager
            lng={lng}
            page={data.meta.page}
            count={data.meta.total_pages}
            showFirstButton
            showLastButton
            componentName="pagerTop"
            aria-label="Top Pager"
          /> */}
        </div>
        <Table.Container className="mt-2 mb-3">
          <Table>
            <Table.Header>
              <Table.Row>
                {getTableColumnDefs(`/dashboard/activity-code/${activityCode?.id}/activities`).map(
                  (column) => {
                    return (
                      <TableHeadingCellSortable
                        key={column.fieldName ?? column.label}
                        lng={lng}
                        {...column}
                        ref={undefined}
                      />
                    )
                  }
                )}
              </Table.Row>
            </Table.Header>

            <Table.Body>
              {activities?.map((activity) => {
                return (
                  <Table.Row key={activity.id}>
                    <Table.Cell style={{ overflowWrap: 'anywhere' }}>
                      <div className="flex items-center gap-2">
                        <CopyButton
                          className="w-[24px] min-w-[24px] h-[24px]"
                          svgClassName="w-[18px]"
                          variant="outlined"
                          size="xs"
                          intent="noeffect"
                          text={activity.url}
                        />
                        <a href={activity.url} target="_blank" rel="noopener noreferrer">
                          {activity.url}
                        </a>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <CopyButton
                          className="w-[24px] min-w-[24px] h-[24px]"
                          svgClassName="w-[18px]"
                          variant="outlined"
                          size="xs"
                          intent="noeffect"
                          text={`${config.publicServerUrl}/${activityCode.code}/${activity.url}`}
                        />
                        <a
                          href={`${config.publicServerUrl}/${activityCode.code}/${activity.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {`${config.publicServerUrl}/${activityCode.code}/${activity.url}`}
                        </a>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{activity.name}</Table.Cell>
                    <Table.Cell className="text-right">
                      {formatDateTime(activity.created_at)}
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
          {padRows(6 - (activities?.length ?? 0))}
        </Table.Container>
        <div className="options flex flex-col gap-2 sm:flex-row items-start sm:items-center mb-5">
          {/* <Select
            containerClassName="sm:ml-auto"
            id="page_size"
            name="page_size"
            size="sm"
            defaultValue="15"
            onValueChange={handleOnPageSizeChange}
          >
            <SelectItem value="15">15</SelectItem>
            <SelectItem value="30">30</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </Select> */}
          {/* <RouterPager
            smoothScrollToTop={true}
            lng={lng}
            page={data.meta.page}
            count={data.meta.total_pages}
            showFirstButton
            showLastButton
            componentName="pagerBottom"
            aria-label="Bottom Pager"
          /> */}
        </div>
      </Container>
    </Section>
  )
}

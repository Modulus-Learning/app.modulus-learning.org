'use client'

import { useEffect, useState } from 'react'

import { Container, IconButton, LoaderRing, PlusIcon, Section, Table } from '@infonomic/uikit/react'
import cx from 'classnames'

import { useProgressBarContext } from '@/context/progress-bar-provider'
import { LangLink } from '@/i18n/components/lang-link'
import {
  TableHeadingCellSortable,
  type TableHeadingCellSortableProps,
} from '@/ui/components/th-sortable'
import { formatNumber } from '@/utils/utils.general'
import type { Locale } from '@/i18n/i18n-config'
import type { LtiPlatformsResponse } from '../@types'

const tableColumnDefs: Omit<TableHeadingCellSortableProps, 'lng'>[] = [
  {
    fieldName: 'name',
    label: 'Name',
    path: '/admin/lti-platforms',
    sortable: false,
    scope: 'col',
    align: 'left',
    className: 'w-[25%]',
  },
  {
    fieldName: 'issuer',
    label: 'Issuer',
    path: '/admin/lti-platforms',
    sortable: false,
    scope: 'col',
    align: 'left',
    className: 'w-[30%]',
  },
  {
    fieldName: 'client_id',
    label: 'Client ID',
    path: '/admin/lti-platforms',
    sortable: false,
    scope: 'col',
    align: 'left',
    className: 'w-[20%]',
  },
  {
    fieldName: 'deployment_id',
    label: 'Deployment ID',
    path: '/admin/lti-platforms',
    sortable: false,
    scope: 'col',
    align: 'left',
    className: 'w-[25%]',
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

function padRows(value: number) {
  return Array.from({ length: value }).map((_, index) => (
    <div key={`empty-row-${index}`} className="h-[32px] border-none">
      &nbsp;
    </div>
  ))
}

export function LtiPlatformsListView({ data, lng }: { data: LtiPlatformsResponse; lng: Locale }) {
  const items = data?.platforms ?? []

  return (
    <Section>
      <Container>
        <div className="flex items-center gap-3 py-[2px]">
          <h1 className="!m-0 pb-[2px]"> LTI Platforms</h1>
          <Stats total={items.length} />
          <IconButton
            aria-label="Create New LTI Platform"
            render={<LangLink href="/admin/lti-platforms/add" lng={lng} />}
          >
            <PlusIcon height="18px" width="18px" svgClassName="stroke-white dark:stroke-black" />
          </IconButton>
        </div>

        {items == null || items.length === 0 ? (
          <div className="caption-bottom text-center mt-[6vh]">No LTI platforms found</div>
        ) : (
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
                {items.map((platform) => {
                  return (
                    <Table.Row key={platform.id}>
                      <Table.Cell>
                        <LangLink href={`/admin/lti-platforms/${platform.id}`} lng={lng}>
                          {platform.name}
                        </LangLink>
                      </Table.Cell>
                      <Table.Cell>{platform.issuer}</Table.Cell>
                      <Table.Cell>{platform.client_id}</Table.Cell>
                      <Table.Cell>{platform.deployment_id}</Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table>
            {padRows(6 - items.length)}
          </Table.Container>
        )}
      </Container>
    </Section>
  )
}

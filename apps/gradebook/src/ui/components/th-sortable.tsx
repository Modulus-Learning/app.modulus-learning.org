'use client'

import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { Table } from '@infonomic/uikit/react'
import cx from 'classnames'

import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { SortAscendingIcon, SortDescendingIcon, SortNeutralIcon } from '@/ui/components/sort-icons'
import type { Locale } from '@/i18n/i18n-config'

type TableHeadingCellProps = React.JSX.IntrinsicElements['th']

export interface TableHeadingCellSortableProps extends TableHeadingCellProps {
  lng: Locale
  label: string
  path?: string
  fieldName?: string
  sortable?: boolean
  desc?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
}

export function TableHeadingCellSortable({
  lng,
  path = '/',
  fieldName,
  label,
  sortable = false,
  align = 'left',
  className,
  ...rest
}: TableHeadingCellSortableProps & {
  ref?: React.RefObject<HTMLTableCellElement>
}) {
  const { navigate } = useLangNavigation(lng)
  const readOnlySearchParams = useSearchParams()
  const searchParams = useMemo(() => {
    return new URLSearchParams(readOnlySearchParams)
  }, [readOnlySearchParams])

  const [desc, setDesc] = useState<boolean | null>(null)

  const handleOnSort = (descending: boolean) => (): void => {
    if (fieldName != null) {
      searchParams.delete('page')
      searchParams.set('order', fieldName)
      searchParams.set('desc', descending ? 'true' : 'false')
      setDesc(descending)
      navigate({ href: `${path}?${searchParams?.toString()}` as string, scroll: false })
    }
  }

  useEffect(() => {
    if (fieldName != null) {
      const order = searchParams.get('order')
      const desc = searchParams.get('desc')
      if (order === fieldName) {
        setDesc(desc === 'true')
      } else {
        setDesc(null)
      }
    }
  }, [fieldName, searchParams])

  if (sortable === false) {
    return (
      <Table.HeadingCell
        className={cx(className, {
          'ml-auto text-right': align === 'right',
        })}
        {...rest}
      >
        {label}
      </Table.HeadingCell>
    )
  }

  const getSortIcon = () => {
    if (desc === null) {
      return <SortNeutralIcon />
    }
    if (desc === true) {
      return <SortDescendingIcon />
    }
    if (desc === false) {
      return <SortAscendingIcon />
    }
  }

  return (
    <Table.HeadingCell className={className} {...rest}>
      <button
        type="button"
        className={cx('flex font-bold text-[0.975rem] gap-1 pl-[2px] pr-[6px] hover:underline', {
          'ml-auto': align === 'right',
        })}
        onClick={handleOnSort(desc !== true)}
      >
        <span>{label}</span>
        {getSortIcon()}
      </button>
    </Table.HeadingCell>
  )
}

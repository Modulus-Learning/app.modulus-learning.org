import type React from 'react'
import { useEffect, useMemo, useState } from 'react'

import { Table } from '@infonomic/uikit/react'
import cx from 'clsx'

import { useLangNavigation, useSearchParams } from '@/framework'
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
  /**
   * The order and direction in effect, when the view resolves them itself
   * (defaults included). When given, the heading shows and toggles this state
   * instead of reading the raw query string, so a default sort is visible and
   * a legacy quoted `desc` value cannot mislead it.
   */
  currentOrder?: string
  currentDesc?: boolean
}

export function TableHeadingCellSortable({
  lng,
  path = '/',
  fieldName,
  label,
  sortable = false,
  align = 'left',
  className,
  currentOrder,
  currentDesc,
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

  // A view that resolves its own order is the authority; derive the state from
  // it directly so the first (server) render already shows it.
  const effectiveDesc =
    currentOrder != null ? (currentOrder === fieldName ? currentDesc === true : null) : desc

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
    if (effectiveDesc === null) {
      return <SortNeutralIcon />
    }
    if (effectiveDesc === true) {
      return <SortDescendingIcon />
    }
    if (effectiveDesc === false) {
      return <SortAscendingIcon />
    }
  }

  const ariaSort = effectiveDesc == null ? 'none' : effectiveDesc ? 'descending' : 'ascending'

  return (
    <Table.HeadingCell className={className} aria-sort={ariaSort} {...rest}>
      <button
        type="button"
        className={cx('flex font-bold text-[0.975rem] gap-1 pl-[2px] pr-[6px] hover:underline', {
          'ml-auto': align === 'right',
        })}
        onClick={handleOnSort(effectiveDesc !== true)}
      >
        <span>{label}</span>
        {/* Communicate that this column is sortable to screen-reader users. */}
        <span className="sr-only"> sortable</span>
        {getSortIcon()}
      </button>
    </Table.HeadingCell>
  )
}

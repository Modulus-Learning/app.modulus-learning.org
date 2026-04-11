'use client'

import { useSearchParams } from 'next/navigation'

import type { PaginationProps } from '@infonomic/uikit/react'
import {
  ChevronLeftDoubleIcon,
  ChevronLeftIcon,
  ChevronRightDoubleIcon,
  ChevronRightIcon,
  Pagination,
} from '@infonomic/uikit/react'

import { LangLink } from '../../i18n/components/lang-link'
import type { Locale } from '@/i18n/i18n-config'

interface RouterPageProps extends PaginationProps {
  lng: Locale
  smoothScrollToTop?: boolean
}

/**
 * A convenience Next.js pager, wrapped around Pagination with
 * example render methods and 'render' props. 'render' will allow you
 * supply a new element to render while also merging the existing props
 * (including styles) of the default component (First, Previous, PageNumber,
 * Next, Last buttons etc.)
 */
export function RouterPager({
  className,
  lng,
  smoothScrollToTop,
  'aria-label': ariaLabel,
  ...rest
}: RouterPageProps): React.JSX.Element {
  // Remix produces a read/write SearchParams object with its useSearchParams hook
  // Next.js only produces a readOnly object. Both produce a standard object as per
  // docs here...
  // https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
  const readOnlySearchParams = useSearchParams()
  const searchParams = new URLSearchParams(readOnlySearchParams)

  return (
    <Pagination variant="dashboard" {...rest}>
      <Pagination.Root className={className} ariaLabel={ariaLabel}>
        <Pagination.Pager
          renderFirst={(key, item) => {
            searchParams.delete('page')
            return (
              <Pagination.First
                render={
                  item.disabled === true ? (
                    <div />
                  ) : (
                    <LangLink
                      lng={lng}
                      scroll={false}
                      smoothScrollToTop={smoothScrollToTop}
                      // Special case empty query string. If so - our LangLink
                      // component will see the '.', which will send them to the current path
                      // without any query parameters, thereby creating the correct canonical
                      // url for this path.
                      href={`${searchParams.toString() != null && searchParams.toString().length > 0 ? `?${searchParams.toString()}` : '.'}`}
                      useOnPointerDown={false}
                    />
                  )
                }
                key={key}
                disabled={item.disabled}
              >
                <ChevronLeftDoubleIcon width="18px" />
              </Pagination.First>
            )
          }}
          renderPrevious={(key, item) => {
            searchParams.set('page', item?.page?.toString())
            return (
              <Pagination.Previous
                render={
                  item.disabled === true ? (
                    <div />
                  ) : (
                    <LangLink
                      lng={lng}
                      scroll={false}
                      smoothScrollToTop={smoothScrollToTop}
                      href={`?${searchParams?.toString()}`}
                      useOnPointerDown={false}
                    />
                  )
                }
                key={key}
                disabled={item.disabled}
              >
                <ChevronLeftIcon width="18px" />
              </Pagination.Previous>
            )
          }}
          renderPageNumber={(key, item) => {
            // Special the first page. If so - our LangLink
            // component will see the '.', which will send them to the current path
            // without any query parameters, thereby creating the correct canonical
            // url for this path.
            if (item?.page === 1) {
              searchParams.delete('page')
            } else {
              searchParams.set('page', item.page?.toString())
            }
            return (
              <Pagination.Number
                render={
                  item.disabled === true ? (
                    <div />
                  ) : (
                    <LangLink
                      lng={lng}
                      scroll={false}
                      smoothScrollToTop={smoothScrollToTop}
                      // Special case empty query string. If so - our LangLink
                      // component will see the '.', which will send them to the current path
                      // without any query parameters, thereby creating the correct canonical
                      // url for this path.
                      href={`${searchParams.toString() != null && searchParams.toString().length > 0 ? `?${searchParams.toString()}` : '.'}`}
                      useOnPointerDown={false}
                    />
                  )
                }
                key={key}
                page={item.page}
                selected={item.selected}
                disabled={item.disabled}
              >
                {item.page}
              </Pagination.Number>
            )
          }}
          renderNext={(key, item) => {
            searchParams.set('page', item?.page?.toString())
            return (
              <Pagination.Next
                render={
                  item.disabled === true ? (
                    <div />
                  ) : (
                    <LangLink
                      lng={lng}
                      scroll={false}
                      smoothScrollToTop={smoothScrollToTop}
                      href={`?${searchParams?.toString()}`}
                      useOnPointerDown={false}
                    />
                  )
                }
                key={key}
                page={item.page}
                disabled={item.disabled}
              >
                <ChevronRightIcon width="18px" />
              </Pagination.Next>
            )
          }}
          renderLast={(key, item, count) => {
            searchParams.set('page', count?.toString())
            return (
              <Pagination.Last
                render={
                  item.disabled === true ? (
                    <div />
                  ) : (
                    <LangLink
                      lng={lng}
                      scroll={false}
                      smoothScrollToTop={smoothScrollToTop}
                      href={`?${searchParams?.toString()}`}
                      useOnPointerDown={false}
                    />
                  )
                }
                key={key}
                disabled={item.disabled}
                count={count}
              >
                <ChevronRightDoubleIcon width="18px" />
              </Pagination.Last>
            )
          }}
          renderEllipses={(key) => {
            return <Pagination.Ellipses key={key} />
          }}
        />
      </Pagination.Root>
    </Pagination>
  )
}

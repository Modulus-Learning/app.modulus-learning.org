import { Button, CopyButton, Search, Table } from '@infonomic/uikit/react'

import { LangLink, useLangNavigation } from '@/framework'
import { applyListView, listViewHref, readListView } from '@/lib/list-view'
import { LocalDateTime } from '@/ui/components/local-date-time'
import { TableHeadingCellSortable } from '@/ui/components/th-sortable'
import { activityCodesListConfig } from '../list-views'
import type { Locale } from '@/i18n/i18n-config'
import type { ActivityCode } from '../@types'

const PATH = '/dashboard'

/**
 * The instructor's activity codes, filtered by code name and sorted from the
 * route's search values. The list is unpaged and already loaded, so this
 * happens on the page; see `@/lib/list-view`.
 */
export function ActivityCodesView({
  activityCodes,
  search,
  lng,
}: {
  activityCodes: ActivityCode[]
  /** The route's parsed search values. */
  search: Record<string, unknown>
  lng: Locale
}) {
  const { navigate } = useLangNavigation(lng)
  const view = readListView(search, activityCodesListConfig)
  const rows = applyListView(activityCodes, view, activityCodesListConfig)

  // Search and clear keep the sort (only when the URL names one); a heading
  // click keeps the search. See `listViewHref` for why the text is serialised
  // by the router's own rules.
  const hrefWith = (query: string | null) =>
    listViewHref(PATH, {
      query,
      order: search.order != null ? view.order : undefined,
      desc: search.desc != null ? view.desc : undefined,
    })

  const handleOnSearch = (query: string): void => {
    if (query != null && query.trim().length > 0) {
      navigate({ href: hrefWith(query.trim()), scroll: false })
    }
  }

  const handleOnClear = (): void => {
    navigate({ href: hrefWith(null), scroll: false })
  }

  const heading = (fieldName: 'code' | 'created_at' | 'updated_at', label: string) => (
    <TableHeadingCellSortable
      lng={lng}
      path={PATH}
      fieldName={fieldName}
      label={label}
      sortable
      scope="col"
      currentOrder={view.order}
      currentDesc={view.desc}
      className={fieldName === 'code' ? 'p-2 text-left min-w-50' : 'p-2'}
    />
  )

  return (
    <>
      <div className="flex justify-between items-center">
        <h1 className="mb-2">Activity Codes</h1>
        <Button
          size="sm"
          variant="outlined"
          render={<LangLink lng={lng} href="/dashboard/create-activity-code" />}
        >
          Create Activity Code
        </Button>
      </div>
      <p className="text-sm mb-4">
        Note: These are instructor-owned activity codes - shown for the currently signed in user.
      </p>
      <div className="options flex flex-col gap-2 sm:flex-row items-start sm:items-center mb-3">
        <Search
          // Keyed on the query so back/forward navigation shows the search in effect.
          key={view.query}
          defaultValue={view.query}
          onSearch={handleOnSearch}
          onClear={handleOnClear}
          inputSize="sm"
          placeholder="Search activity codes"
          ariaLabel="Search activity codes"
          className="mr-auto w-full max-w-[350px]"
        />
        <p className="text-sm m-0" role="status" data-testid="activity-codes-count">
          {view.query.length > 0
            ? `${rows.length} of ${activityCodes.length} activity codes match “${view.query}”`
            : `${activityCodes.length} activity codes`}
        </p>
      </div>
      <Table.Container>
        <Table>
          <Table.Header>
            <Table.Row>
              {heading('code', 'Code')}
              {heading('created_at', 'Created')}
              {heading('updated_at', 'Updated')}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((activityCode) => (
              <Table.Row key={activityCode.id}>
                <Table.Cell className="py-3">
                  <div className="flex items-center gap-2">
                    <CopyButton
                      className="w-6 min-w-6 h-6"
                      svgClassName="w-[18px]"
                      variant="outlined"
                      size="xs"
                      intent="noeffect"
                      aria-label={`Copy activity code ${activityCode.code}`}
                      text={activityCode.code}
                    />
                    <LangLink
                      lng={lng}
                      className="pb-0.75"
                      href={`/dashboard/activity-code/${activityCode.id}`}
                    >
                      {activityCode.code}
                    </LangLink>
                  </div>
                </Table.Cell>
                <Table.Cell className="items-center gap-2">
                  <LocalDateTime value={activityCode.created_at} />
                </Table.Cell>
                <Table.Cell className="items-center gap-2">
                  <LocalDateTime value={activityCode.updated_at} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Table.Container>
      {rows.length === 0 && (
        <p className="text-sm mt-3" data-testid="activity-codes-empty">
          {activityCodes.length === 0
            ? 'You have no activity codes yet.'
            : `No activity codes match “${view.query}”.`}
        </p>
      )}
    </>
  )
}

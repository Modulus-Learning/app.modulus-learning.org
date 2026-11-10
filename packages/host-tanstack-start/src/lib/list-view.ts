// Search and sort for small, fully loaded lists.
//
// The activity code and activity lists are unpaged and scoped to one
// instructor or one code, so the page filters and sorts the rows it already
// has, from the route's search values. `readListView` turns the router's
// parsed search (unknown values) into a known view; `applyListView` applies it.
//
// Rules: search is a case-insensitive substring match; strings compare by
// lower-cased code point (the same on server and client, whatever the
// process's locale); dates compare by parsed time; missing values, and dates
// that do not parse, sort last in both directions; ties keep input order.

import { defaultStringifySearch } from '@tanstack/react-router'

export type ListColumn<Row> =
  | { kind: 'string'; value: (row: Row) => string | null | undefined }
  | { kind: 'date'; value: (row: Row) => string | null | undefined }

export interface ListViewConfig<Row, Order extends string> {
  /** The sortable columns: the whitelist for `order`. */
  columns: Record<Order, ListColumn<Row>>
  defaultOrder: NoInfer<Order>
  defaultDesc: boolean
  /** The values a search matches against. */
  search: (row: Row) => (string | null | undefined)[]
}

export interface ListView<Order extends string> {
  query: string
  order: Order
  desc: boolean
}

const readBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return fallback
}

/** Reads a list view from the router's parsed search, falling back to the defaults. */
export function readListView<Row, Order extends string>(
  search: Record<string, unknown>,
  config: ListViewConfig<Row, Order>
): ListView<Order> {
  const rawOrder = search.order
  const order =
    typeof rawOrder === 'string' && Object.hasOwn(config.columns, rawOrder)
      ? (rawOrder as Order)
      : config.defaultOrder
  const rawQuery = search.query
  const query =
    typeof rawQuery === 'string' || typeof rawQuery === 'number' ? String(rawQuery).trim() : ''
  return { query, order, desc: readBoolean(search.desc, config.defaultDesc) }
}

const sortKey = <Row>(column: ListColumn<Row>, row: Row): string | number | null => {
  const value = column.value(row)
  if (value == null) return null
  if (column.kind === 'date') {
    const time = Date.parse(value)
    return Number.isNaN(time) ? null : time
  }
  return value.toLowerCase()
}

const compareKeys = (a: string | number, b: string | number): number => (a < b ? -1 : a > b ? 1 : 0)

/** Returns the rows matching the view's search, in the view's order. The input is not changed. */
export function applyListView<Row, Order extends string>(
  rows: readonly Row[],
  view: ListView<Order>,
  config: ListViewConfig<Row, Order>
): Row[] {
  const needle = view.query.toLowerCase()
  const matching =
    needle === ''
      ? rows
      : rows.filter((row) =>
          config.search(row).some((value) => value?.toLowerCase().includes(needle) === true)
        )

  const column = config.columns[view.order]
  return matching
    .map((row, index) => ({ row, index, key: sortKey(column, row) }))
    .sort((a, b) => {
      if (a.key == null || b.key == null) {
        // Missing values last in either direction; two missing keep input order.
        if (a.key == null && b.key == null) return a.index - b.index
        return a.key == null ? 1 : -1
      }
      const order = compareKeys(a.key, b.key)
      if (order !== 0) return view.desc ? -order : order
      return a.index - b.index
    })
    .map(({ row }) => row)
}

/**
 * The href for a list view, serialised as the router will parse it. The router
 * JSON-parses each search value, so user text such as `true`, `null` or `1e3`
 * written raw would come back as a boolean, null or 1000. The router's own
 * stringifier quotes exactly those strings, and leaves `desc` a plain boolean.
 * `order` and `desc` are written only when given, so a default view keeps a
 * bare URL.
 */
export function listViewHref(
  path: string,
  { query, order, desc }: { query?: string | null; order?: string; desc?: boolean }
): string {
  const search: Record<string, string | boolean> = {}
  if (query != null && query.length > 0) search.query = query
  if (order != null) search.order = order
  if (desc != null) search.desc = desc
  return `${path}${defaultStringifySearch(search)}`
}

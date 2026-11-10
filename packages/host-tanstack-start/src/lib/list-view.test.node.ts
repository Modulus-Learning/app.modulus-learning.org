import { describe, expect, test } from 'vitest'

import { applyListView, type ListViewConfig, readListView } from './list-view'

type Row = { id: string; code: string; name: string | null; created_at: string | null }

const config: ListViewConfig<Row, 'code' | 'name' | 'created_at'> = {
  columns: {
    code: { kind: 'string', value: (row) => row.code },
    name: { kind: 'string', value: (row) => row.name },
    created_at: { kind: 'date', value: (row) => row.created_at },
  },
  defaultOrder: 'created_at',
  defaultDesc: true,
  search: (row) => [row.code, row.name],
}

const rows: Row[] = [
  { id: '1', code: 'casual-cow', name: 'Bravo', created_at: '2026-01-02T00:00:00.000Z' },
  { id: '2', code: 'tasteless-whippet', name: null, created_at: '2026-01-03T00:00:00.000Z' },
  { id: '3', code: 'Brave-Otter', name: 'alpha', created_at: null },
  { id: '4', code: 'quiet-quail', name: 'Bravo', created_at: 'not a date' },
]

const ids = (list: Row[]) => list.map((row) => row.id)

describe('readListView', () => {
  test('missing values take the defaults', () => {
    expect(readListView({}, config)).toEqual({ query: '', order: 'created_at', desc: true })
  })

  test('booleans, strings and legacy quoted values all read as booleans', () => {
    expect(readListView({ desc: false }, config).desc).toBe(false)
    expect(readListView({ desc: 'false' }, config).desc).toBe(false)
    expect(readListView({ desc: 'true' }, config).desc).toBe(true)
    expect(readListView({ desc: 'nonsense' }, config).desc).toBe(true)
  })

  test('an order outside the whitelist falls back to the default', () => {
    expect(readListView({ order: 'private_code' }, config).order).toBe('created_at')
    expect(readListView({ order: 'name' }, config).order).toBe('name')
  })

  test('a query the router parsed as a number stays a string', () => {
    expect(readListView({ query: 2026 }, config).query).toBe('2026')
    expect(readListView({ query: '  cow ' }, config).query).toBe('cow')
  })
})

describe('applyListView', () => {
  test('does not mutate the input array', () => {
    const input = [...rows]
    applyListView(input, { query: '', order: 'code', desc: false }, config)
    expect(ids(input)).toEqual(['1', '2', '3', '4'])
  })

  test('search is a case-insensitive substring match over the search fields', () => {
    expect(ids(applyListView(rows, { query: 'COW', order: 'code', desc: false }, config))).toEqual([
      '1',
    ])
    expect(
      ids(applyListView(rows, { query: 'ALPHA', order: 'code', desc: false }, config))
    ).toEqual(['3'])
    expect(applyListView(rows, { query: 'zebra', order: 'code', desc: false }, config)).toEqual([])
  })

  test('strings sort case-insensitively, both ways', () => {
    expect(ids(applyListView(rows, { query: '', order: 'code', desc: false }, config))).toEqual([
      '3',
      '1',
      '4',
      '2',
    ])
    expect(ids(applyListView(rows, { query: '', order: 'code', desc: true }, config))).toEqual([
      '2',
      '4',
      '1',
      '3',
    ])
  })

  test('nulls sort last in both directions, and ties keep their input order', () => {
    expect(ids(applyListView(rows, { query: '', order: 'name', desc: false }, config))).toEqual([
      '3',
      '1',
      '4',
      '2',
    ])
    expect(ids(applyListView(rows, { query: '', order: 'name', desc: true }, config))).toEqual([
      '1',
      '4',
      '3',
      '2',
    ])
  })

  test('dates sort by time; missing and invalid dates sort last, in input order', () => {
    expect(
      ids(applyListView(rows, { query: '', order: 'created_at', desc: true }, config))
    ).toEqual(['2', '1', '3', '4'])
    expect(
      ids(applyListView(rows, { query: '', order: 'created_at', desc: false }, config))
    ).toEqual(['1', '2', '3', '4'])
  })
})

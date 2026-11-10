import { act, createElement, type ReactNode } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Activity, ActivityCode } from '../@types'

// The Activity Codes and Activities lists: search and sort apply to the loaded
// rows, and the headings show the order in effect, defaults included.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), searchString: '' }))

vi.mock('@/framework', () => ({
  useLangNavigation: () => ({ navigate: mocks.navigate }),
  useSearchParams: () => new URLSearchParams(mocks.searchString),
  LangLink: ({ children, href }: { children?: ReactNode; href?: string }) =>
    createElement('a', { href }, children),
}))
vi.mock('@/config/provider', () => ({
  usePublicConfig: () => ({ publicServerUrl: 'https://modulus.test' }),
}))
vi.mock('@/context/progress-bar-provider', () => ({
  useProgressBarContext: () => ({ loading: false }),
}))
vi.mock('@/ui/components/local-date-time', () => ({
  LocalDateTime: ({ value }: { value: string }) => createElement('time', {}, value),
}))
// The uikit ships CSS modules the test runner cannot load.
vi.mock('@infonomic/uikit/react', () => {
  const el =
    (tag: string) =>
    ({ children, className, ...rest }: { children?: ReactNode; className?: string }) =>
      createElement(tag, { className, ...rest }, children)
  const Table = Object.assign(el('table'), {
    Container: el('div'),
    Header: el('thead'),
    Body: el('tbody'),
    Row: el('tr'),
    HeadingCell: el('th'),
    Cell: el('td'),
  })
  return {
    Table,
    Container: el('div'),
    Section: el('section'),
    LoaderRing: () => null,
    CopyButton: () => null,
    Button: ({ children }: { children?: ReactNode }) => createElement('span', {}, children),
    Search: ({ defaultValue }: { defaultValue?: string }) =>
      createElement('input', { 'data-testid': 'search', defaultValue }),
  }
})

import { ActivitiesView } from './activities-view'
import { ActivityCodesView } from './activity-codes-view'

const CODES: ActivityCode[] = [
  ['1', 'casual-cow', '2026-04-18T02:55:00.000Z', '2026-04-18T03:00:00.000Z'],
  ['2', 'tasteless-whippet', '2026-03-26T08:15:00.000Z', '2026-06-23T09:36:00.000Z'],
  ['3', 'alright-dormouse', '2026-05-29T11:38:00.000Z', '2026-05-29T11:38:00.000Z'],
].map(([id, code, created_at, updated_at]) => ({
  id: id as string,
  code: code as string,
  created_by: null,
  private_code: 'private',
  url_prefix: null,
  description: null,
  created_at: created_at as string,
  updated_at: updated_at as string,
}))

const ACTIVITIES: Activity[] = [
  {
    id: 'a',
    url: 'calculus-1/lesson-02',
    name: 'Limits',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'b',
    url: 'calculus-1/lesson-01',
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
  },
  {
    id: 'c',
    url: 'calculus-1',
    name: 'Course',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  mocks.navigate.mockReset()
  mocks.searchString = ''
})

const render = (node: ReactNode) => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(node))
  return container
}

const codesView = (search: Record<string, unknown>) => {
  mocks.searchString = new URLSearchParams(
    Object.entries(search).map(([key, value]) => [key, String(value)])
  ).toString()
  return render(createElement(ActivityCodesView, { activityCodes: CODES, search, lng: 'en' }))
}

const firstColumn = (view: HTMLElement) =>
  Array.from(view.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)

const ariaSort = (view: HTMLElement) =>
  Array.from(view.querySelectorAll('th')).map(
    (th) => `${th.textContent?.split(' ')[0]}:${th.getAttribute('aria-sort')}`
  )

const clickHeading = (view: HTMLElement, label: string) => {
  const button = Array.from(view.querySelectorAll('th button')).find((el) =>
    el.textContent?.startsWith(label)
  )
  expect(button).toBeDefined()
  act(() => (button as HTMLButtonElement).click())
  return mocks.navigate.mock.calls.at(-1)?.[0].href as string
}

describe('ActivityCodesView', () => {
  test('the default order is updated, newest first, and the heading shows it', () => {
    const view = codesView({})
    expect(firstColumn(view)).toEqual(['tasteless-whippet', 'alright-dormouse', 'casual-cow'])
    expect(ariaSort(view)).toContain('Updated:descending')
  })

  test('a heading click navigates on /dashboard; two clicks reverse the order', () => {
    const first = new URL(clickHeading(codesView({}), 'Code'), 'https://x.test')
    expect(first.pathname).toBe('/dashboard')
    expect(first.searchParams.get('order')).toBe('code')
    expect(first.searchParams.get('desc')).toBe('true')
    act(() => root?.unmount())

    const descending = codesView({ order: 'code', desc: true })
    expect(firstColumn(descending)).toEqual(['tasteless-whippet', 'casual-cow', 'alright-dormouse'])
    const second = new URL(clickHeading(descending, 'Code'), 'https://x.test')
    expect(second.searchParams.get('desc')).toBe('false')
  })

  test('a legacy quoted desc value is read, and the next click reverses it', () => {
    const view = codesView({ order: 'created_at', desc: 'false' })
    expect(ariaSort(view)).toContain('Created:ascending')
    const href = new URL(clickHeading(view, 'Created'), 'https://x.test')
    expect(href.searchParams.get('desc')).toBe('true')
  })

  test('search matches the code name and keeps the sort', () => {
    const view = codesView({ query: 'COW', order: 'code', desc: false })
    expect(firstColumn(view)).toEqual(['casual-cow'])
    expect(view.querySelector('[data-testid="activity-codes-count"]')?.textContent).toBe(
      '1 of 3 activity codes match “COW”'
    )
    expect(view.querySelector('[data-testid="search"]')?.getAttribute('value')).toBe('COW')
    const heading = new URL(clickHeading(view, 'Updated'), 'https://x.test')
    expect(heading.searchParams.get('query')).toBe('COW')
  })

  test('no matches and no codes read differently', () => {
    const none = codesView({ query: 'zebra' })
    expect(none.querySelector('[data-testid="activity-codes-empty"]')?.textContent).toBe(
      'No activity codes match “zebra”.'
    )
    act(() => root?.unmount())
    const empty = render(
      createElement(ActivityCodesView, { activityCodes: [], search: {}, lng: 'en' })
    )
    expect(empty.querySelector('[data-testid="activity-codes-empty"]')?.textContent).toBe(
      'You have no activity codes yet.'
    )
  })
})

describe('ActivitiesView', () => {
  const activitiesView = (search: Record<string, unknown>, activities = ACTIVITIES) =>
    render(
      createElement(ActivitiesView, {
        activityCode: CODES[0] as ActivityCode,
        activities,
        search,
        lng: 'en',
      })
    )

  test('the default order is created, newest first, and the heading shows it', () => {
    const view = activitiesView({})
    expect(firstColumn(view)).toEqual([
      'calculus-1/lesson-01',
      'calculus-1/lesson-02',
      'calculus-1',
    ])
    expect(ariaSort(view)).toContain('Created:descending')
  })

  test('sorts by name with the unnamed activity last, both ways', () => {
    expect(firstColumn(activitiesView({ order: 'name', desc: false }))).toEqual([
      'calculus-1',
      'calculus-1/lesson-02',
      'calculus-1/lesson-01',
    ])
    act(() => root?.unmount())
    expect(firstColumn(activitiesView({ order: 'name', desc: true }))).toEqual([
      'calculus-1/lesson-02',
      'calculus-1',
      'calculus-1/lesson-01',
    ])
  })

  test('search matches URL or name', () => {
    expect(firstColumn(activitiesView({ query: 'limits' }))).toEqual(['calculus-1/lesson-02'])
    act(() => root?.unmount())
    expect(firstColumn(activitiesView({ query: 'lesson-01' }))).toEqual(['calculus-1/lesson-01'])
  })

  test('no matches and no registered activities read differently', () => {
    expect(
      activitiesView({ query: 'zebra' }).querySelector('[data-testid="activities-empty"]')
        ?.textContent
    ).toBe('No activities match “zebra”.')
    act(() => root?.unmount())
    expect(
      activitiesView({}, []).querySelector('[data-testid="activities-empty"]')?.textContent
    ).toBe('No activities are registered for this activity code yet.')
  })
})

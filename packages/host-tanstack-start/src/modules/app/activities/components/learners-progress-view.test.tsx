import { act, createElement, type ReactNode } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { ProgressResponse } from '../@types'

// Regression: the sortable column headings navigated to a route that does not
// exist (`/dashboard/metrics/:id/learners`), so sorting the learners list
// ended on the not-found page.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@/framework', () => ({
  useLangNavigation: () => ({ navigate: mocks.navigate }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/context/progress-bar-provider', () => ({
  useProgressBarContext: () => ({ start: () => {}, done: () => {} }),
}))
vi.mock('@/ui/components/router-pager', () => ({ RouterPager: () => null }))

// The uikit ships CSS modules the test runner cannot load; plain elements are
// enough to exercise the headings.
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
    Container: el('div'),
    Section: el('section'),
    LoaderRing: () => null,
    Search: () => null,
    Select: () => null,
    Table,
  }
})

import { LearnersProgressView } from './learners-progress-view'

const ACTIVITY_CODE_ID = '019d27b5-ce97-751b-ba8c-ac3fccc26929'

const data: ProgressResponse = {
  progress: [],
  included: {
    activity_code: {
      id: ACTIVITY_CODE_ID,
      code: 'brave-otter',
      description: null,
    } as unknown as NonNullable<ProgressResponse['included']['activity_code']>,
  },
  meta: { page: 1, page_size: 15, total: 0, total_pages: 1, order: 'updated_at', desc: true },
}

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  mocks.navigate.mockReset()
})

const render = (node: ReactNode) => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(node))
  return container
}

describe('LearnersProgressView sortable headings', () => {
  test.each(['Full Name', 'Progress'])('sorting by %s stays on the learners route', (label) => {
    const view = render(createElement(LearnersProgressView, { data, lng: 'en' }))

    const button = Array.from(view.querySelectorAll('th button')).find((el) =>
      el.textContent?.includes(label)
    )
    expect(button).toBeDefined()
    act(() => (button as HTMLButtonElement).click())

    expect(mocks.navigate).toHaveBeenCalledTimes(1)
    const href: string = mocks.navigate.mock.calls[0]?.[0].href
    expect(href.split('?')[0]).toBe(`/dashboard/activity-code/${ACTIVITY_CODE_ID}/learners`)
  })
})

import { act, createElement, type ReactNode } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), edit: vi.fn(), delete: vi.fn() }))

vi.mock('../preview', () => ({ previewAllowlistImpact: mocks.preview }))
vi.mock('../edit', () => ({ editAllowlistRule: mocks.edit }))
vi.mock('../delete', () => ({ deleteAllowlistRule: mocks.delete }))
vi.mock('@/ui/theme/provider', () => ({ useTheme: () => ({ theme: 'light' }) }))
vi.mock('@/i18n/components/lang-link', () => ({
  LangLink: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}))
vi.mock('@infonomic/uikit/react', () => {
  const box = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  const table = Object.assign(box, {
    Container: box,
    Header: box,
    Row: box,
    HeadingCell: box,
    Body: box,
    Cell: box,
  })
  return {
    Alert: ({ children }: { children?: ReactNode }) => <div role="alert">{children}</div>,
    Container: box,
    Section: box,
    Badge: box,
    Table: table,
    PlusIcon: () => null,
    LoaderEllipsis: () => null,
    IconButton: box,
    Button: ({
      children,
      onClick,
      disabled,
      type = 'button',
    }: {
      children?: ReactNode
      onClick?: () => void
      disabled?: boolean
      type?: 'button' | 'submit' | 'reset'
    }) => (
      <button type={type} disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
    Checkbox: ({
      label,
      checked,
      onCheckedChange,
    }: {
      label: string
      checked: boolean
      onCheckedChange: (checked: boolean) => void
    }) => (
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
    ),
    TextArea: () => <textarea />,
  }
})

import { AllowlistRuleEditForm } from './edit-form'
import { AllowlistRulesListView } from './list-view'
import type { AllowlistRule } from '../@types'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const rule: AllowlistRule = {
  id: '019c2d8e-842a-7715-a323-a7e31427db2d',
  base_url: 'https://content.test/course',
  origin: 'https://content.test',
  path_prefix: '/course',
  description: null,
  is_enabled: true,
  created_by: null,
  updated_by: null,
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.resetAllMocks()
  mocks.preview.mockResolvedValue({
    status: 'success',
    impact: { total_activities: 1, grandfathered_count: 1, grandfathered_sample: [] },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

const clickButton = async (text: string) => {
  const button = [...container.querySelectorAll('button')].find(
    (element) => element.textContent === text
  )
  expect(button).toBeDefined()
  await act(async () => button?.click())
}

describe('allowlist change previews', () => {
  test.each(['disable', 'delete'])(
    '%s confirmation previews the selected rule removal',
    async (action) => {
      await act(async () => root.render(<AllowlistRuleEditForm rule={rule} lng="en" />))
      if (action === 'disable') {
        const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
        expect(checkbox).not.toBeNull()
        await act(async () => checkbox?.click())
      } else {
        await clickButton('Delete rule')
      }
      await clickButton('Count the activities the proposed policy leaves grandfathered')
      expect(mocks.preview).toHaveBeenCalledTimes(1)
      const submitted = mocks.preview.mock.calls[0]?.[1] as FormData
      expect(submitted.get('excluded_rule_id')).toBe(rule.id)
      expect(container.textContent).toContain(
        '1 of 1 existing activity is grandfathered under the proposed policy'
      )
      expect(mocks.edit).not.toHaveBeenCalled()
      expect(mocks.delete).not.toHaveBeenCalled()
    }
  )
})

describe('allowlist list state rendering', () => {
  test.each([
    'You do not have permission to view the activity URL allowlist.',
    'Unable to load the activity URL allowlist. Please try again.',
  ])('shows the load error: %s', (message) => {
    const markup = renderToStaticMarkup(
      createElement(AllowlistRulesListView, {
        lng: 'en',
        data: { status: 'failed', message },
      })
    )
    expect(markup).toContain(message)
    expect(markup).toContain('role="alert"')
    expect(markup).not.toContain('No allowlist rules exist')
    expect(markup).not.toContain('all valid activity URLs can be registered')
  })

  test('shows allow-all only after successfully loading an empty list', () => {
    const markup = renderToStaticMarkup(
      <AllowlistRulesListView lng="en" data={{ status: 'success', rules: [] }} />
    )
    expect(markup).toContain('No allowlist rules exist')
  })

  test('shows allow-all with disabled rules and keeps their table visible', () => {
    const markup = renderToStaticMarkup(
      <AllowlistRulesListView
        lng="en"
        data={{ status: 'success', rules: [{ ...rule, is_enabled: false }] }}
      />
    )
    expect(markup).toContain('All allowlist rules are disabled')
    expect(markup).toContain('all valid activity URLs can be registered')
    expect(markup).toContain(rule.base_url)
    expect(markup).not.toContain('No allowlist rules exist')
  })

  test('renders successfully loaded rules', () => {
    const markup = renderToStaticMarkup(
      <AllowlistRulesListView lng="en" data={{ status: 'success', rules: [rule] }} />
    )
    expect(markup).toContain(rule.base_url)
    expect(markup).toContain('Enabled')
    expect(markup).not.toContain('all valid activity URLs can be registered')
    expect(markup).not.toContain('No allowlist rules exist')
  })
})

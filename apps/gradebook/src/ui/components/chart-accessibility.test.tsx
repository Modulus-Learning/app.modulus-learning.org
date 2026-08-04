import { createElement, type ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@infonomic/uikit/react', () => ({
  LoaderRing: () => createElement('span', { 'data-loader': true }),
}))

vi.mock('@/ui/theme/provider', () => ({
  useTheme: () => ({ theme: 'light' }),
}))

vi.mock('recharts', () => {
  type MockProps = Record<string, unknown> & { children?: ReactNode }

  return {
    Bar: ({ dataKey, name }: MockProps) =>
      createElement('g', { 'data-bar': String(dataKey), 'data-name': String(name) }),
    BarChart: ({ children, role, title, desc, accessibilityLayer }: MockProps) =>
      createElement(
        'svg',
        {
          role,
          'data-accessibility-layer': String(accessibilityLayer),
        },
        createElement('title', null, String(title)),
        createElement('desc', null, String(desc)),
        children
      ),
    CartesianGrid: () => null,
    Legend: () => null,
    ResponsiveContainer: ({ children }: MockProps) => children,
    Tooltip: ({ content }: MockProps) => {
      const renderContent = content as (props: Record<string, unknown>) => ReactNode
      return renderContent({
        active: true,
        accessibilityLayer: false,
        label: 'January',
        payload: [
          {
            dataKey: 'value',
            name: 'Registrations',
            value: 12,
            payload: { name: 'January', value: 12, returning: 7 },
          },
        ],
      })
    },
    XAxis: () => null,
    YAxis: () => null,
  }
})

import { AccessibleBarChart } from './bar-chart'
import { AccessibleBarChartStacked } from './bar-chart-stacked'
import { AccessibleChartFrame } from './chart-accessibility'

interface TestRow {
  name: string
  value: number
  returning: number
}

const data: TestRow[] = [
  { name: 'January', value: 12, returning: 7 },
  { name: 'February', value: 20, returning: 9 },
]

function render(markup: ReactNode): HTMLElement {
  document.body.innerHTML = renderToStaticMarkup(markup)
  return document.body
}

describe('accessible chart composition', () => {
  test('renders a static named graphic and exact-value table without a live tooltip', () => {
    const root = render(
      <AccessibleBarChart
        className="h-[200px]"
        status="idle"
        data={data}
        title="Registrations per month"
        description="Monthly registrations during 2026."
        summary="February has the highest value at 20 registrations."
        category={{ dataKey: 'name', label: 'Month' }}
        series={{ dataKey: 'value', label: 'Registrations', unit: 'registrations' }}
      />
    )

    const graphic = root.querySelector('svg')
    expect(graphic?.getAttribute('role')).toBe('img')
    expect(graphic?.querySelector('title')?.textContent).toBe('Registrations per month')
    expect(graphic?.getAttribute('tabindex')).toBeNull()
    expect(graphic?.getAttribute('data-accessibility-layer')).toBe('false')
    expect(graphic?.querySelector('desc')?.textContent).toBe('Monthly registrations during 2026.')
    expect(root.querySelector('[role="application"]')).toBeNull()
    expect(graphic?.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(root.querySelector('[aria-live]')).toBeNull()
    expect(root.querySelector('[aria-hidden="true"]')?.textContent).toContain('12 registrations')

    expect(root.querySelector('summary')?.textContent).toBe(
      'View data table for Registrations per month'
    )
    expect(root.querySelector('caption')?.textContent).toBe('Registrations per month data')
    expect(Array.from(root.querySelectorAll('thead th')).map((cell) => cell.textContent)).toEqual([
      'Month',
      'Registrations',
    ])
    expect(Array.from(root.querySelectorAll('tbody tr')).map((row) => row.textContent)).toEqual([
      'January12',
      'February20',
    ])
  })

  test('renders one exact-value column for every stacked series', () => {
    const root = render(
      <AccessibleBarChartStacked
        className="h-[200px]"
        status="idle"
        data={data}
        title="New vs returning users"
        description="Monthly comparison during 2026."
        summary="New users lead in both months."
        category={{ dataKey: 'name', label: 'Month' }}
        series={[
          { dataKey: 'value', label: 'New users', unit: 'users', color: '#ccc' },
          { dataKey: 'returning', label: 'Returning users', unit: 'users', color: '#333' },
        ]}
      />
    )

    expect(Array.from(root.querySelectorAll('thead th')).map((cell) => cell.textContent)).toEqual([
      'Month',
      'New users',
      'Returning users',
    ])
    expect(
      Array.from(root.querySelectorAll('[data-bar]')).map((bar) => bar.getAttribute('data-name'))
    ).toEqual(['New users', 'Returning users'])
  })

  test.each([
    ['busy', 'Loading Test chart.'],
    ['idle', 'No data is available for Test chart.'],
    ['error', 'Test chart could not be loaded.'],
  ] as const)('exposes the %s state in text', (status, expectedMessage) => {
    const root = render(
      <AccessibleChartFrame
        title="Test chart"
        description="Test description."
        summary="Test summary."
        status={status}
        data={[] as TestRow[]}
        category={{ dataKey: 'name', label: 'Month' }}
        series={[{ dataKey: 'value', label: 'Users', unit: 'users' }]}
        chartClassName="h-[200px]"
      >
        <span>visual</span>
      </AccessibleChartFrame>
    )

    expect(root.textContent).toContain(expectedMessage)
    expect(root.querySelector('table')).toBeNull()
  })
})

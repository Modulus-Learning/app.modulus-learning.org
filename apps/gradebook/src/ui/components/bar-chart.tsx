'use client'

import { LoaderRing } from '@infonomic/uikit/react'
import type { TooltipContentProps } from 'recharts'
import {
  Bar,
  BarChart as BarChartBase,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  AccessibleChartFrame,
  type ChartCategory,
  type ChartSeries,
  type ChartStatus,
  formatChartValue,
} from '@/ui/components/chart-accessibility'
import { useTheme } from '@/ui/theme/provider'

interface AccessibleBarChartProps<T extends object> {
  className: string
  status: ChartStatus
  data: T[]
  title: string
  description: string
  summary: string
  category: ChartCategory<T>
  series: ChartSeries<T>
  loadingMessage?: string
  emptyMessage?: string
  errorMessage?: string
}

function StaticTooltip<T extends object>({
  active,
  payload,
  category,
  series,
}: TooltipContentProps & {
  category: ChartCategory<T>
  series: ChartSeries<T>
}) {
  const row = payload?.[0]?.payload as T | undefined

  if (!active || !row) {
    return null
  }

  return (
    <div className="border-radius-md background px-4 py-2" aria-hidden="true">
      <p>{formatChartValue(row[category.dataKey], row, category.formatValue)}</p>
      <p>
        {formatChartValue(row[series.dataKey], row, series.formatValue)} {series.unit}
      </p>
    </div>
  )
}

export function AccessibleBarChart<T extends object>({
  className,
  status,
  data,
  title,
  description,
  summary,
  category,
  series,
  loadingMessage,
  emptyMessage,
  errorMessage,
}: AccessibleBarChartProps<T>) {
  const { theme } = useTheme()

  return (
    <AccessibleChartFrame
      title={title}
      description={description}
      summary={summary}
      status={status}
      data={data}
      category={category}
      series={[series]}
      chartClassName={className}
      loadingMessage={loadingMessage}
      emptyMessage={emptyMessage}
      errorMessage={errorMessage}
    >
      {status === 'busy' ? (
        <LoaderRing size={42} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChartBase
            data={data}
            accessibilityLayer={false}
            role="img"
            title={title}
            desc={description}
          >
            <CartesianGrid
              strokeDasharray="2"
              vertical={false}
              className="stroke-gray-200 dark:stroke-gray-600"
            />
            <XAxis
              dataKey={category.dataKey}
              className="text-sm"
              tick={{ fill: 'var(--foreground)' }}
            />
            <YAxis
              className="text-sm"
              tick={{ fill: 'var(--foreground)' }}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${value.toLocaleString()}`}
            />
            <Tooltip
              content={(props) => <StaticTooltip {...props} category={category} series={series} />}
              cursor={{ fill: theme === 'dark' ? '#303030' : '#EEEEEE' }}
            />
            <Bar
              dataKey={series.dataKey}
              name={series.label}
              radius={[3, 3, 0, 0]}
              style={{ fill: 'var(--foreground)' }}
            />
          </BarChartBase>
        </ResponsiveContainer>
      )}
    </AccessibleChartFrame>
  )
}

// Transitional export while existing consumers move to AccessibleBarChart.
// Remove this implementation after the learner activity chart is migrated.
function LegacyTooltip({
  active,
  payload,
  label,
  accessibilityLayer,
  unit,
}: TooltipContentProps & { unit?: string }) {
  return (
    <div
      className="border-radius-md background px-4 py-2"
      role={accessibilityLayer ? 'status' : undefined}
      aria-live={accessibilityLayer ? 'assertive' : undefined}
    >
      {active && payload?.length ? (
        <>
          <p>{label}</p>
          <p>
            {payload[0].value} {unit ?? 'users'}
          </p>
        </>
      ) : null}
    </div>
  )
}

export function BarChart({
  className,
  status,
  barDataKey,
  xAxisDataKey,
  data,
  tooltipUnit,
  ariaLabel,
}: {
  className: string
  status: 'busy' | 'idle'
  barDataKey: string
  xAxisDataKey: string
  data: unknown[]
  tooltipUnit?: string
  ariaLabel?: string
}) {
  const { theme } = useTheme()

  return (
    <div className={className}>
      {status === 'busy' ? (
        <div className="flex h-[200px] items-center justify-center">
          <LoaderRing size={42} />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChartBase data={data} aria-label={ariaLabel}>
            <CartesianGrid
              strokeDasharray="2"
              vertical={false}
              className="stroke-gray-200 dark:stroke-gray-600"
            />
            <XAxis dataKey={xAxisDataKey} tick={{ fill: 'var(--foreground)' }} />
            <YAxis
              tick={{ fill: 'var(--foreground)' }}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${value.toLocaleString()}`}
            />
            <Tooltip
              content={(props) => <LegacyTooltip {...props} unit={tooltipUnit} />}
              cursor={{ fill: theme === 'dark' ? '#303030' : '#EEEEEE' }}
            />
            <Bar dataKey={barDataKey} radius={[3, 3, 0, 0]} fill="var(--foreground)" />
          </BarChartBase>
        </ResponsiveContainer>
      )}
    </div>
  )
}

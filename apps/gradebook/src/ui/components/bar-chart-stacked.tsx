'use client'

import { LoaderRing } from '@infonomic/uikit/react'
import type { TooltipContentProps } from 'recharts'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

interface AccessibleBarChartStackedProps<T extends object> {
  className: string
  status: ChartStatus
  data: T[]
  title: string
  description: string
  summary: string
  category: ChartCategory<T>
  series: ChartSeries<T>[]
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
  series: ChartSeries<T>[]
}) {
  const row = payload?.[0]?.payload as T | undefined

  if (!active || !row) {
    return null
  }

  return (
    <div className="border-radius-md background px-4 py-2" aria-hidden="true">
      <p>{formatChartValue(row[category.dataKey], row, category.formatValue)}</p>
      {series.map((item) => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {item.label}: {formatChartValue(row[item.dataKey], row, item.formatValue)} {item.unit}
        </p>
      ))}
    </div>
  )
}

export function AccessibleBarChartStacked<T extends object>({
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
}: AccessibleBarChartStackedProps<T>) {
  const { theme } = useTheme()

  return (
    <AccessibleChartFrame
      title={title}
      description={description}
      summary={summary}
      status={status}
      data={data}
      category={category}
      series={series}
      chartClassName={className}
      loadingMessage={loadingMessage}
      emptyMessage={emptyMessage}
      errorMessage={errorMessage}
    >
      {status === 'busy' ? (
        <LoaderRing size={42} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
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
            <Legend layout="vertical" align="right" verticalAlign="top" />
            {series.map((item) => (
              <Bar
                key={item.dataKey}
                dataKey={item.dataKey}
                name={item.label}
                stackId="a"
                fill={item.color}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </AccessibleChartFrame>
  )
}

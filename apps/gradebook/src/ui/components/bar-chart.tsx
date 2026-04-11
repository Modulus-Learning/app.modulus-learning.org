'use client'

import { LoaderRing } from '@infonomic/uikit/react'
import {
  Bar,
  BarChart as BarChartBase,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useTheme } from '@/ui/theme/provider'

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: any
  label?: string
}) {
  if (active && payload?.length) {
    return (
      <div className="border-radius-md py-2 px-4 background">
        <p>{label}</p>
        <p>{payload[0].value} users</p>
      </div>
    )
  }
  return null
}

export function BarChart({
  className,
  status,
  barDataKey,
  xAxisDataKey,
  data,
}: {
  className: string
  status: 'busy' | 'idle'
  barDataKey: string
  xAxisDataKey: string
  data: any[]
}) {
  const { theme } = useTheme()
  return (
    <div className={className}>
      {status === 'busy' && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 200,
          }}
        >
          <LoaderRing size={42} />
        </div>
      )}
      {status === 'idle' && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChartBase data={data}>
            <CartesianGrid
              strokeDasharray="2"
              vertical={false}
              className="stroke-gray-200 dark:stroke-gray-600"
            />
            <XAxis
              dataKey={xAxisDataKey}
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
              // @ts-expect-error
              content={CustomTooltip}
              cursor={{ fill: theme === 'dark' ? '#303030' : '#EEEEEE' }}
              contentStyle={{
                backgroundColor: '#303030',
                borderColor: '#303030',
              }}
              labelStyle={{ backgroundColor: '#303030' }}
            />
            <Bar dataKey={barDataKey} radius={[3, 3, 0, 0]} style={{ fill: 'var(--foreground)' }} />
          </BarChartBase>
        </ResponsiveContainer>
      )}
    </div>
  )
}

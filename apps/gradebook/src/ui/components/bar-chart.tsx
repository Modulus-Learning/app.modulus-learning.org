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

import { useTheme } from '@/ui/theme/provider'

// The wrapper must stay mounted, with role="status" / aria-live, so screen
// readers announce tooltip changes during keyboard navigation — matching
// the contract of recharts' DefaultTooltipContent.
function CustomTooltip({
  active,
  payload,
  label,
  accessibilityLayer,
  unit,
}: TooltipContentProps & { unit?: string }) {
  return (
    <div
      className="border-radius-md py-2 px-4 background"
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
  data: any[]
  tooltipUnit?: string
  ariaLabel?: string
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
          <BarChartBase data={data} aria-label={ariaLabel}>
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
              content={(props) => <CustomTooltip {...props} unit={tooltipUnit} />}
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

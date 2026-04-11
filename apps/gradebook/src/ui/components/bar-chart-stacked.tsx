'use client'

import { LoaderRing } from '@infonomic/uikit/react'
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
        {payload.map(({ fill, name, value }: { fill: string; name: string; value: number }) => (
          <p key={name} style={{ color: fill }}>{`${name}: ${value} users`}</p>
        ))}
      </div>
    )
  }
  return null
}

export function BarChartStacked({
  className,
  status,
  data,
  dataKey,
}: {
  className: string
  status: 'busy' | 'idle'
  data: any[]
  dataKey: any[]
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
          <BarChart width={500} height={300} data={data}>
            <CartesianGrid
              strokeDasharray="2"
              vertical={false}
              className="stroke-gray-200 dark:stroke-gray-600"
            />
            <XAxis dataKey="name" className="text-sm" tick={{ fill: 'var(--foreground)' }} />
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
            <Legend layout="vertical" align="right" verticalAlign="top" />
            {dataKey.map(({ key, color }) => (
              <Bar key={key} dataKey={key} stackId="a" fill={color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

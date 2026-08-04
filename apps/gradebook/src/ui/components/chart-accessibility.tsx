'use client'

import type { ReactNode } from 'react'

export type ChartStatus = 'busy' | 'idle' | 'error'

export type ChartDataKey<T extends object> = Extract<keyof T, string>

export interface ChartCategory<T extends object> {
  dataKey: ChartDataKey<T>
  label: string
  formatValue?: (value: unknown, row: T) => string
}

export interface ChartSeries<T extends object> {
  dataKey: ChartDataKey<T>
  label: string
  unit: string
  color?: string
  formatValue?: (value: unknown, row: T) => string
}

interface AccessibleChartFrameProps<T extends object> {
  title: string
  description: string
  summary: string
  status: ChartStatus
  data: readonly T[]
  category: ChartCategory<T>
  series: readonly ChartSeries<T>[]
  chartClassName: string
  loadingMessage?: string
  emptyMessage?: string
  errorMessage?: string
  children: ReactNode
}

export function formatChartValue<T extends object>(
  value: unknown,
  row: T,
  formatter?: (value: unknown, row: T) => string
): string {
  if (formatter) {
    return formatter(value, row)
  }

  if (typeof value === 'number') {
    return value.toLocaleString('en-US')
  }

  return value == null ? '' : String(value)
}

export function ChartDataTable<T extends object>({
  title,
  data,
  category,
  series,
}: Pick<AccessibleChartFrameProps<T>, 'title' | 'data' | 'category' | 'series'>) {
  return (
    <details className="group">
      <summary className="w-fit cursor-pointer rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">
        View data table for {title}
      </summary>
      <div
        className="mt-3 overflow-x-auto rounded-md border"
        role="region"
        aria-label={`${title} data table`}
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{title} data</caption>
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium" scope="col">
                {category.label}
              </th>
              {series.map((item) => (
                <th className="px-3 py-2 text-right font-medium" key={item.dataKey} scope="col">
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const categoryValue = row[category.dataKey]
              const formattedCategory = formatChartValue(categoryValue, row, category.formatValue)

              return (
                <tr className="border-b last:border-b-0" key={formattedCategory}>
                  <th className="px-3 py-2 text-left font-normal" scope="row">
                    {formattedCategory}
                  </th>
                  {series.map((item) => (
                    <td className="px-3 py-2 text-right tabular-nums" key={item.dataKey}>
                      {formatChartValue(row[item.dataKey], row, item.formatValue)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function AccessibleChartFrame<T extends object>({
  title,
  description,
  summary,
  status,
  data,
  category,
  series,
  chartClassName,
  loadingMessage = `Loading ${title}.`,
  emptyMessage = `No data is available for ${title}.`,
  errorMessage = `${title} could not be loaded.`,
  children,
}: AccessibleChartFrameProps<T>) {
  const hasData = data.length > 0

  return (
    <figure className="space-y-4">
      <figcaption className="space-y-1 text-sm text-muted-foreground">
        <p>{description}</p>
        {status === 'idle' && hasData ? <p>{summary}</p> : null}
      </figcaption>

      {status === 'busy' ? (
        <div
          className={`${chartClassName} flex flex-col items-center justify-center gap-2`}
          role="status"
        >
          {children}
          <span>{loadingMessage}</span>
        </div>
      ) : null}

      {status === 'error' ? <p role="alert">{errorMessage}</p> : null}

      {status === 'idle' && !hasData ? <p role="status">{emptyMessage}</p> : null}

      {status === 'idle' && hasData ? (
        <>
          <div className={chartClassName}>{children}</div>
          <ChartDataTable title={title} data={data} category={category} series={series} />
        </>
      ) : null}
    </figure>
  )
}

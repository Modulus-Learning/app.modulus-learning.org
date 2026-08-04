'use client'

import { useSearchParams } from 'next/navigation'

import { Card, Select } from '@infonomic/uikit/react'

import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { AccessibleBarChart } from '@/ui/components/bar-chart'
import { formatMonthYear, summarizeRegistrations } from '../chart-summaries'
import type { Locale } from '@/i18n/i18n-config'
import type { RegistrationsPerDay } from '../@types'

export function RegistrationsPerDayView({
  result,
  lng,
}: {
  result: RegistrationsPerDay
  lng: Locale
}) {
  const { navigate } = useLangNavigation(lng)
  const readOnlySearchParams = useSearchParams()
  const searchParams = new URLSearchParams(readOnlySearchParams)
  const period = formatMonthYear(result.meta.year, result.meta.month)

  function handleOnMonthChange(value: unknown): void {
    const v = value as string
    if (v != null && v.length > 0) {
      const year = searchParams.get('year')
      if (year == null) {
        const now = new Date()
        const year = now.getUTCFullYear() // Server is UTC
        searchParams.set('year', year.toString())
      }
      searchParams.set('month', v)
      navigate({
        href: `/admin?${searchParams?.toString()}` as string,
        scroll: true,
        smoothScrollToTop: true,
      })
    }
  }

  function handleOnYearChange(value: unknown): void {
    const v = value as string
    if (v != null && v.length > 0) {
      searchParams.set('year', v)
      navigate({
        href: `/admin?${searchParams?.toString()}` as string,
        scroll: true,
        smoothScrollToTop: true,
      })
    }
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title className="text-[1.3rem] font-semibold flex items-center justify-between">
          <span>Registrations Per Day</span>
          <div className="flex items-center gap-2">
            <Select
              size="sm"
              id="month"
              ariaLabel="Month"
              variant="outlined"
              defaultValue=""
              placeholder="Month"
              className="dark:text-gray-300"
              onValueChange={handleOnMonthChange}
              value={result.meta.month.toString()}
              items={result.included.months.map((month) => ({
                value: month.toString(),
                label: month.toString(),
              }))}
            />
            <Select
              size="sm"
              id="year"
              ariaLabel="Year"
              variant="outlined"
              defaultValue=""
              placeholder="Year"
              className="dark:text-gray-300"
              onValueChange={handleOnYearChange}
              value={result.meta.year.toString()}
              items={result.included.years.map((year) => ({
                value: year.toString(),
                label: year.toString(),
              }))}
            />
          </div>
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <AccessibleBarChart
          className="w-full h-[200px]"
          status="idle"
          data={result.data}
          title="Registrations Per Day"
          description={`Daily registration counts for ${period}.`}
          summary={summarizeRegistrations(result.data, period)}
          category={{ dataKey: 'name', label: 'Day' }}
          series={{ dataKey: 'value', label: 'Registrations', unit: 'registrations' }}
        />
      </Card.Content>
    </Card>
  )
}

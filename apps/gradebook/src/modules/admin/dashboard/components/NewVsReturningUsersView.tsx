'use client'

import { useSearchParams } from 'next/navigation'

import { Card, Select } from '@infonomic/uikit/react'

import { useLangNavigation } from '@/i18n/hooks/use-lang-navigation'
import { BarChartStacked } from '@/ui/components/bar-chart-stacked'
import { useTheme } from '@/ui/theme/provider'
import type { Locale } from '@/i18n/i18n-config'
import type { NewVsReturningUsers } from '../@types'

export function NewVsReturningUsersView({
  result,
  lng,
}: {
  result: NewVsReturningUsers
  lng: Locale
}) {
  const { navigate } = useLangNavigation(lng)
  const readOnlySearchParams = useSearchParams()
  const searchParams = new URLSearchParams(readOnlySearchParams)
  const { theme } = useTheme()

  const dataKey = [
    { key: 'new', color: theme === 'dark' ? '#FFFFFF' : '#CCCCCC' },
    { key: 'returning', color: theme === 'dark' ? 'var(--primary-100)' : 'var(--primary-400)' },
  ]

  function handleOnYearChange(value: unknown): void {
    const v = value as string
    if (v != null && v.length > 0) {
      searchParams.delete('month')
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
          <span>New vs Returning Users</span>
          <Select
            size="sm"
            id="year"
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
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <BarChartStacked
          className="w-full h-[200px]"
          status={'idle'}
          data={result.data}
          dataKey={dataKey}
        />
      </Card.Content>
    </Card>
  )
}

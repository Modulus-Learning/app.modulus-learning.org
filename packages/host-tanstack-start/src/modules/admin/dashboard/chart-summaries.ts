import type { Datum, NewVsReturningDatum } from './@types'

const numberFormatter = new Intl.NumberFormat('en-US')

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatCategories(names: string[], totalCategories: number): string {
  if (names.length === totalCategories) {
    return 'every period shown'
  }

  if (names.length === 1) {
    return names[0]
  }

  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function peak(data: Datum[]): { value: number; names: string[] } {
  const value = Math.max(...data.map((item) => item.value))
  return { value, names: data.filter((item) => item.value === value).map((item) => item.name) }
}

export function summarizeRegistrations(data: Datum[], period: string): string {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  if (data.length === 0 || total === 0) {
    return `No registrations were recorded for ${period}.`
  }

  const highest = peak(data)
  const categories = formatCategories(highest.names, data.length)

  if (highest.names.length === data.length) {
    return `${formatNumber(total)} registrations were recorded for ${period}. Every period shown has ${formatNumber(highest.value)} registrations.`
  }

  const peakVerb = highest.names.length === 1 ? 'has' : 'share'
  return `${formatNumber(total)} registrations were recorded for ${period}. ${categories} ${peakVerb} the highest value at ${formatNumber(highest.value)} registrations.`
}

export function summarizeMonthlyActiveUsers(data: Datum[], year: number): string {
  if (data.length === 0 || data.every((item) => item.value === 0)) {
    return `No monthly active users were recorded for ${year}.`
  }

  const values = data.map((item) => item.value)
  const minimum = Math.min(...values)
  const highest = peak(data)

  if (minimum === highest.value) {
    return `Monthly active users remain at ${formatNumber(highest.value)} throughout the periods shown for ${year}.`
  }

  const categories = formatCategories(highest.names, data.length)
  const peakVerb = highest.names.length === 1 ? 'has' : 'share'
  return `Monthly active users range from ${formatNumber(minimum)} to ${formatNumber(highest.value)} during ${year}. ${categories} ${peakVerb} the peak value.`
}

function seriesPeak(
  data: NewVsReturningDatum[],
  dataKey: 'new' | 'returning'
): { value: number; names: string[] } {
  const value = Math.max(...data.map((item) => item[dataKey]))
  return { value, names: data.filter((item) => item[dataKey] === value).map((item) => item.name) }
}

export function summarizeNewVsReturningUsers(data: NewVsReturningDatum[], year: number): string {
  if (data.length === 0 || data.every((item) => item.new === 0 && item.returning === 0)) {
    return `No new or returning user activity was recorded for ${year}.`
  }

  const newPeak = seriesPeak(data, 'new')
  const returningPeak = seriesPeak(data, 'returning')
  const newLeads = data.filter((item) => item.new > item.returning).length
  const returningLeads = data.filter((item) => item.returning > item.new).length
  const ties = data.length - newLeads - returningLeads

  const comparison = [
    `${newLeads} ${newLeads === 1 ? 'period' : 'periods'} led by new users`,
    `${returningLeads} ${returningLeads === 1 ? 'period' : 'periods'} led by returning users`,
    `${ties} ${ties === 1 ? 'tie' : 'ties'}`,
  ].join(', ')

  return `New users peak at ${formatNumber(newPeak.value)} in ${formatCategories(newPeak.names, data.length)}; returning users peak at ${formatNumber(returningPeak.value)} in ${formatCategories(returningPeak.names, data.length)}. Across ${year}: ${comparison}.`
}

export function formatMonthYear(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

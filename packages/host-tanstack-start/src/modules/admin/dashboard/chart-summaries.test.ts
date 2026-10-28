import { describe, expect, test } from 'vitest'

import {
  formatMonthYear,
  summarizeMonthlyActiveUsers,
  summarizeNewVsReturningUsers,
  summarizeRegistrations,
} from './chart-summaries'

describe('administration chart summaries', () => {
  test('summarizes registration totals and a single peak', () => {
    expect(
      summarizeRegistrations(
        [
          { name: 'January', value: 4 },
          { name: 'February', value: 9 },
          { name: 'March', value: 2 },
        ],
        '2026'
      )
    ).toBe(
      '15 registrations were recorded for 2026. February has the highest value at 9 registrations.'
    )
  })

  test('handles empty, zero, flat, and tied registration data', () => {
    expect(summarizeRegistrations([], 'August 2026')).toBe(
      'No registrations were recorded for August 2026.'
    )
    expect(summarizeRegistrations([{ name: '1', value: 0 }], 'August 2026')).toBe(
      'No registrations were recorded for August 2026.'
    )
    expect(
      summarizeRegistrations(
        [
          { name: 'January', value: 3 },
          { name: 'February', value: 3 },
        ],
        '2026'
      )
    ).toContain('Every period shown has 3 registrations.')
    expect(
      summarizeRegistrations(
        [
          { name: 'January', value: 5 },
          { name: 'February', value: 2 },
          { name: 'March', value: 5 },
        ],
        '2026'
      )
    ).toContain('January and March share the highest value')
  })

  test('describes active-user range without summing monthly people', () => {
    expect(
      summarizeMonthlyActiveUsers(
        [
          { name: 'January', value: 12 },
          { name: 'February', value: 7 },
          { name: 'March', value: 12 },
        ],
        2026
      )
    ).toBe(
      'Monthly active users range from 7 to 12 during 2026. January and March share the peak value.'
    )
    expect(
      summarizeMonthlyActiveUsers(
        [
          { name: 'January', value: 4 },
          { name: 'February', value: 4 },
        ],
        2026
      )
    ).toContain('remain at 4')
    expect(summarizeMonthlyActiveUsers([], 2026)).toContain('No monthly active users')
  })

  test('compares both series without treating monthly counts as annual unique users', () => {
    const summary = summarizeNewVsReturningUsers(
      [
        { name: 'January', new: 8, returning: 3 },
        { name: 'February', new: 4, returning: 9 },
        { name: 'March', new: 4, returning: 4 },
      ],
      2026
    )

    expect(summary).toContain('New users peak at 8 in January')
    expect(summary).toContain('returning users peak at 9 in February')
    expect(summary).toContain('1 period led by new users, 1 period led by returning users, 1 tie')
    expect(summarizeNewVsReturningUsers([], 2026)).toContain('No new or returning user activity')
    expect(
      summarizeNewVsReturningUsers([{ name: 'January', new: 0, returning: 0 }], 2026)
    ).toContain('No new or returning user activity')
  })

  test('formats selected month and year in UTC', () => {
    expect(formatMonthYear(2026, 8)).toBe('August 2026')
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { ChartDataTable } from '@/ui/components/chart-accessibility'
import {
  generateIllustrativeLearnerActivityData,
  getLearnerActivityStatistics,
  LEARNER_ACTIVITY_DESCRIPTION,
  summarizeIllustrativeLearnerActivity,
} from './completion-chart-data'

describe('illustrative learner activity chart', () => {
  const data = generateIllustrativeLearnerActivityData()
  const statistics = getLearnerActivityStatistics(data)

  test('retains the deterministic 12-week, 5,000-student sample', () => {
    expect(data).toHaveLength(12)
    expect(statistics.totalStudents).toBe(5000)
    expect(statistics.maxWeek).toEqual({
      week: 'Week 12',
      date: 'Mar 19–Mar 25',
      students: 2118,
    })
    expect(statistics.earlyPercentage).toBe(14)
    expect(statistics.latePercentage).toBe(51)
  })

  test('labels the generated distribution as illustrative and not activity-specific', () => {
    expect(LEARNER_ACTIVITY_DESCRIPTION).toContain('Illustrative distribution')
    expect(LEARNER_ACTIVITY_DESCRIPTION).toContain('not activity-specific completion data')
    expect(summarizeIllustrativeLearnerActivity(statistics)).toContain(
      'The illustrative sample peaks in Week 12'
    )
  })

  test('makes every plotted week and value available in the native table', () => {
    document.body.innerHTML = renderToStaticMarkup(
      <ChartDataTable
        title="Learner Activity — Illustrative Sample"
        data={data}
        category={{
          dataKey: 'week',
          label: 'Week and date range',
          formatValue: (_value, row) => `${row.week} (${row.date})`,
        }}
        series={[{ dataKey: 'students', label: 'Sample students', unit: 'students' }]}
      />
    )

    const rows = Array.from(document.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(12)
    for (const [index, row] of rows.entries()) {
      expect(row.textContent).toContain(data[index].week)
      expect(row.textContent).toContain(data[index].date)
      expect(row.textContent).toContain(data[index].students.toLocaleString('en-US'))
    }
  })
})

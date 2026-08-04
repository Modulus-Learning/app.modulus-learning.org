'use client'

import { Card, InfoIcon } from '@infonomic/uikit/react'

import { AccessibleBarChart } from '@/ui/components/bar-chart'
import {
  generateIllustrativeLearnerActivityData,
  getLearnerActivityStatistics,
  LEARNER_ACTIVITY_DESCRIPTION,
  LEARNER_ACTIVITY_TITLE,
  summarizeIllustrativeLearnerActivity,
} from './completion-chart-data'

const activityData = generateIllustrativeLearnerActivityData()
const statistics = getLearnerActivityStatistics(activityData)
const activitySummary = summarizeIllustrativeLearnerActivity(statistics)

export function CompletionChart() {
  return (
    <div className="flex flex-col gap-6 mb-12">
      <div
        className="grid gap-6 md:grid-cols-3"
        role="group"
        aria-label="Illustrative learner statistics"
      >
        <Card>
          <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Card.Title className="text-sm font-medium">Sample Students</Card.Title>
            <InfoIcon svgClassName="fill-black dark:fill-white" />
          </Card.Header>
          <Card.Content>
            <div className="text-2xl font-bold">{statistics.totalStudents.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Students in this illustrative distribution
            </p>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Card.Title className="text-sm font-medium">Sample Peak</Card.Title>
            <InfoIcon svgClassName="fill-black dark:fill-white" />
          </Card.Header>
          <Card.Content>
            <div className="text-2xl font-bold">{statistics.maxWeek.students.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Sample students during {statistics.maxWeek.week} ({statistics.peakPercentage}% of the
              sample)
            </p>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Card.Title className="text-sm font-medium">Sample Timing</Card.Title>
            <InfoIcon svgClassName="fill-black dark:fill-white" />
          </Card.Header>
          <Card.Content>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium">First four weeks</div>
                <div className="text-xl font-bold">{statistics.earlyPercentage}%</div>
              </div>
              <div>
                <div className="text-sm font-medium">Final four weeks</div>
                <div className="text-xl font-bold">{statistics.latePercentage}%</div>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>

      <Card className="col-span-4">
        <Card.Header>
          <Card.Title>
            <h2 style={{ font: 'inherit', color: 'inherit', margin: 0 }}>
              {LEARNER_ACTIVITY_TITLE}
            </h2>
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <AccessibleBarChart
            className="w-full h-[400px]"
            status="idle"
            data={activityData}
            title={LEARNER_ACTIVITY_TITLE}
            description={LEARNER_ACTIVITY_DESCRIPTION}
            summary={activitySummary}
            category={{
              dataKey: 'week',
              label: 'Week and date range',
              formatValue: (_value, row) => `${row.week} (${row.date})`,
            }}
            series={{ dataKey: 'students', label: 'Sample students', unit: 'students' }}
          />
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>
            <h2 style={{ font: 'inherit', color: 'inherit', margin: 0 }}>
              Illustrative Sample Insights
            </h2>
          </Card.Title>
          <Card.Description>
            These observations describe the generated sample, not the selected activity.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium">Distribution Peak</h3>
              <p className="text-sm text-muted-foreground">
                The generated sample peaks in {statistics.maxWeek.week}, when{' '}
                {statistics.maxWeek.students.toLocaleString()} students ({statistics.peakPercentage}
                % of the sample) are placed in the distribution.
              </p>
            </div>
            <div>
              <h3 className="font-medium">Early vs. Late Sample</h3>
              <p className="text-sm text-muted-foreground">
                {statistics.earlyPercentage}% of the sample is placed in the first four weeks, while{' '}
                {statistics.latePercentage}% is placed in the final four weeks.
              </p>
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}

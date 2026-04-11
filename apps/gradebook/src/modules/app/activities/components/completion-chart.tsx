'use client'

import { Card, InfoIcon } from '@infonomic/uikit/react'

import { BarChart } from '@/ui/components/bar-chart'
import { useTheme } from '@/ui/theme/provider'
import type { ProgressResponse } from '../@types'

// Generate a Poisson-like distribution for student activity
const generateStudentActivityData = () => {
  // 12 weeks (approximately 3 months)
  const weeks = 12
  const totalStudents = 5000

  // Create a Poisson-like distribution
  const distribution = []

  // Parameters to control the shape of the distribution
  const peak = 5 // Peak around week 5-6 (middle)
  const spread = 2.5 // Control the spread of the distribution

  let remainingStudents = totalStudents

  for (let i = 0; i < weeks; i++) {
    // Calculate a value based on distance from peak (Poisson-like)
    const distanceFromPeak = Math.abs(i - peak)
    const probability = Math.exp(-distanceFromPeak / spread) / (spread * Math.sqrt(2 * Math.PI))

    // Allocate students based on probability
    let studentsInWeek: number

    if (i === weeks - 1) {
      // Last week gets all remaining students to ensure total is exactly 5000
      studentsInWeek = remainingStudents
    } else {
      // Calculate students for this week based on probability
      studentsInWeek = Math.round(totalStudents * probability * 0.8)
      // Ensure we don't exceed remaining students
      studentsInWeek = Math.min(studentsInWeek, remainingStudents)
    }

    remainingStudents -= studentsInWeek

    // Format date for the week
    const startDate = new Date(2023, 0, 1 + i * 7)
    const endDate = new Date(2023, 0, 7 + i * 7)
    const dateLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

    distribution.push({
      week: `Week ${i + 1}`,
      date: dateLabel,
      students: studentsInWeek,
    })
  }

  return distribution
}

const activityData = generateStudentActivityData()

// Calculate summary statistics
const totalStudents = activityData.reduce((sum, item) => sum + item.students, 0)
const maxWeek = activityData.reduce(
  (max, item) => (item.students > max.students ? item : max),
  activityData[0]
)
const earlyCompleters = activityData.slice(0, 4).reduce((sum, item) => sum + item.students, 0)
const lateCompleters = activityData.slice(8).reduce((sum, item) => sum + item.students, 0)

export function CompletionChart({ data }: { data: ProgressResponse }) {
  const { theme } = useTheme()

  return (
    <div className="flex flex-col gap-6 mb-12">
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Card.Title className="text-sm font-medium">Total Students</Card.Title>
            <InfoIcon svgClassName="fill-black dark:fill-white" />
          </Card.Header>
          <Card.Content>
            <div className="text-2xl font-bold">{totalStudents.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Students tracked in this activity</p>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Card.Title className="text-sm font-medium">Peak Activity</Card.Title>
            <InfoIcon svgClassName="fill-black dark:fill-white" />
          </Card.Header>
          <Card.Content>
            <div className="text-2xl font-bold">{maxWeek.students.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Students during {maxWeek.week} ({Math.round((maxWeek.students / totalStudents) * 100)}
              % of total)
            </p>
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Card.Title className="text-sm font-medium">Completion Timing</Card.Title>
            <InfoIcon svgClassName="fill-black dark:fill-white" />
          </Card.Header>
          <Card.Content>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium">Early</div>
                <div className="text-xl font-bold">
                  {Math.round((earlyCompleters / totalStudents) * 100)}%
                </div>
              </div>
              <div>
                <div className="text-sm font-medium">Late</div>
                <div className="text-xl font-bold">
                  {Math.round((lateCompleters / totalStudents) * 100)}%
                </div>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
      <Card className="col-span-4">
        <Card.Header>
          <Card.Title>Learner Activity</Card.Title>
          <Card.Description>
            {`Distribution of 5,000 students completing activity ${data?.included?.activity_code?.code} over a 3-month period`}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <BarChart
            className="w-full h-[400px]"
            status={'idle'}
            barDataKey="students"
            xAxisDataKey="week"
            data={activityData}
          />
        </Card.Content>
      </Card>
      <Card>
        <Card.Header>
          <Card.Title>Activity Insights</Card.Title>
          <Card.Description>Analysis of student completion patterns.</Card.Description>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium">Distribution Pattern</h3>
              <p className="text-sm text-muted-foreground">
                The data shows a Poisson-like distribution with most students completing the
                activity during the middle weeks. {maxWeek.students} students (
                {Math.round((maxWeek.students / totalStudents) * 100)}% of total) completed the
                activity during {maxWeek.week}.
              </p>
            </div>
            <div>
              <h3 className="font-medium">Early vs. Late Completers</h3>
              <p className="text-sm text-muted-foreground">
                {Math.round((earlyCompleters / totalStudents) * 100)}% of students completed the
                activity in the first month, while {''}
                {Math.round((lateCompleters / totalStudents) * 100)}% waited until the final month
                to complete it.
              </p>
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}

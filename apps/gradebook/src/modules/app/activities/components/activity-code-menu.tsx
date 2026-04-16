import Link from 'next/link'

import { Card, Container, Section } from '@infonomic/uikit/react'
import { BarChart3, Calendar, ChevronRight, ClipboardList, Link2, Users } from 'lucide-react'

import type { Locale } from '@/i18n/i18n-config'
import type { ActivityCode } from '@/modules/app/activities/@types'

export function ActivityCodeMenu({
  lng,
  activityCode,
}: {
  lng: Locale
  activityCode: ActivityCode
}) {
  return (
    <Section>
      <Container className="mb-4">
        <div className="flex flex-col gap-1">
          <h1 className="!m-0 pb-[2px]">{activityCode.code}</h1>
          <p className="text-muted-foreground">Activity code analytics</p>
        </div>
      </Container>

      <Container className="mb-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Learners and Progress */}
          <Card
            render={
              <Link
                href={`/dashboard/activity-code/${activityCode.id}/learners`}
                className="transition-all hover:scale-[1.02]"
              />
            }
            hover={true}
            className="h-full overflow-hidden"
          >
            <Card.Header className="pb-2">
              <Card.Title className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Learners
              </Card.Title>
              <Card.Description>Learners and current progress per activity.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="rounded-md border p-2">
                <TableSkeleton />
              </div>
            </Card.Content>
            <Card.Footer className="pt-2">
              <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
                <span>View details</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Card.Footer>
          </Card>

          {/* 2. Activities */}

          <Card
            render={
              <Link
                href={`/dashboard/activity-code/${activityCode.id}/activities`}
                className="transition-all hover:scale-[1.02]"
              />
            }
            hover={true}
            className="h-full overflow-hidden"
          >
            <Card.Header className="pb-2">
              <Card.Title className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Activities
              </Card.Title>
              <Card.Description>Table of activity URLs.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="rounded-md border p-2">
                <TableSkeleton rows={4} />
              </div>
            </Card.Content>
            <Card.Footer className="pt-2">
              <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
                <span>View details</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Card.Footer>
          </Card>

          {/* 3. Enrollment */}

          <Card
            render={<Link href="#" className="transition-all hover:scale-[1.02]" />}
            hover={true}
            className="h-full overflow-hidden"
          >
            <Card.Header className="pb-2">
              <Card.Title className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Enrollment
              </Card.Title>
              <Card.Description>
                Time distribution of learners enrolling / starting their first activity.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="rounded-md border p-2">
                <HistogramSkeleton />
              </div>
            </Card.Content>
            <Card.Footer className="pt-2">
              <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
                <span>View details</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Card.Footer>
          </Card>

          {/* 4. Completion Data */}

          <Card
            render={
              <Link
                href={`/dashboard/activity-code/${activityCode.id}/completion`}
                className="transition-all hover:scale-[1.02]"
              />
            }
            hover={true}
            className="h-full overflow-hidden"
          >
            <Card.Header className="pb-2">
              <Card.Title className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Completion Data
              </Card.Title>
              <Card.Description>
                Time distribution of learners completing activities.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="rounded-md border p-2">
                <HistogramSkeleton variant="completion" />
              </div>
            </Card.Content>
            <Card.Footer className="pt-2">
              <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
                <span>View details</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Card.Footer>
          </Card>

          {/* 5. Activities Metrics */}

          <Card
            render={<Link href="#" className="transition-all hover:scale-[1.02]" />}
            hover={true}
            className="h-full overflow-hidden"
          >
            <Card.Header className="pb-2">
              <Card.Title className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Activity Metrics
              </Card.Title>
              <Card.Description>Event distribution for activity.</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="rounded-md border p-2">
                <HistogramSkeleton variant="events" />
              </div>
            </Card.Content>
            <Card.Footer className="pt-2">
              <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
                <span>View details</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Card.Footer>
          </Card>
        </div>
      </Container>
    </Section>
  )
}

// Skeletal table component
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-2">
        <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-600"></div>
        <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-600"></div>
        <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-600"></div>
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-700"></div>
          <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-700"></div>
          <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-700"></div>
        </div>
      ))}
    </div>
  )
}

// Skeletal histogram component
function HistogramSkeleton({
  variant = 'enrollment',
}: {
  variant?: 'enrollment' | 'completion' | 'events'
}) {
  // Different patterns for different histogram types with more data points
  const getPattern = () => {
    switch (variant) {
      case 'enrollment':
        // Front-loaded pattern with more granularity
        return [80, 65, 55, 45, 35, 30, 25, 20, 15, 10, 5, 3]
      case 'completion':
        // Bell curve pattern (Poisson-like) with more granularity
        return [5, 10, 20, 35, 60, 75, 60, 35, 20, 10, 5, 3]
      case 'events':
        // More random pattern with more data points
        return [25, 15, 35, 20, 45, 30, 50, 25, 40, 15, 30, 20]
      default:
        return [20, 30, 40, 50, 45, 35, 30, 25, 20, 15, 10, 5]
    }
  }

  const bars = getPattern()
  const max = Math.max(...bars)

  return (
    <div className="flex h-16 items-end justify-between gap-[2px]">
      {bars.map((height, i) => (
        <div
          key={i}
          className="w-full rounded-t bg-gray-100 dark:bg-gray-700"
          style={{ height: `${(height / max) * 100}%` }}
        ></div>
      ))}
    </div>
  )
}

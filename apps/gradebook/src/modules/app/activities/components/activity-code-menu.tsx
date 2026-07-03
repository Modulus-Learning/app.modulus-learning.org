import type { ReactNode } from 'react'
import Link from 'next/link'

import { Button, Card, Container, Section } from '@infonomic/uikit/react'
import { BarChart3, Calendar, ChevronRight, ClipboardList, Link2, Users } from 'lucide-react'

import { LangLink } from '@/i18n/components/lang-link'
import type { Locale } from '@/i18n/i18n-config'
import type { ActivityCode } from '@/modules/app/activities/@types'

const cardClassName = 'flex h-full flex-col overflow-hidden'
const cardHeaderClassName = 'min-h-24 pb-2'
const cardContentClassName = 'flex-1'
const cardFooterClassName = 'mt-auto pt-2'

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
          <div className="flex items-center gap-2 justify-between">
            <p className="text-muted-foreground">Activity code analytics</p>
            <Button
              size="sm"
              variant="outlined"
              render={
                <LangLink href={`/dashboard/activity-code/${activityCode.id}/activities/edit`} />
              }
            >
              Update Activity Code
            </Button>
          </div>
          {activityCode?.description && (
            <div>
              <p> {activityCode?.description}</p>
            </div>
          )}
        </div>
      </Container>

      <Container className="mb-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <AnalyticsCard
            href={`/dashboard/activity-code/${activityCode.id}/learners`}
            icon={<Users className="h-5 w-5" />}
            title="Learners"
            description="Learners and current progress per activity."
          >
            <TableSkeleton />
          </AnalyticsCard>

          <AnalyticsCard
            href={`/dashboard/activity-code/${activityCode.id}/activities`}
            icon={<Link2 className="h-5 w-5" />}
            title="Activities"
            description="Table of activity URLs."
          >
            <TableSkeleton rows={4} />
          </AnalyticsCard>

          <AnalyticsCard
            href="#"
            icon={<Calendar className="h-5 w-5" />}
            title="Enrollment"
            description="Time distribution of learners enrolling / starting their first activity."
          >
            <HistogramSkeleton />
          </AnalyticsCard>

          <AnalyticsCard
            href={`/dashboard/activity-code/${activityCode.id}/completion`}
            icon={<BarChart3 className="h-5 w-5" />}
            title="Completion Data"
            description="Time distribution of learners completing activities."
          >
            <HistogramSkeleton variant="completion" />
          </AnalyticsCard>

          <AnalyticsCard
            href="#"
            icon={<ClipboardList className="h-5 w-5" />}
            title="Activity Metrics"
            description="Event distribution for activity."
          >
            <HistogramSkeleton variant="events" />
          </AnalyticsCard>
        </div>
      </Container>
    </Section>
  )
}

/**
 * Analytics link-card using the "link overlay" pattern
 * (https://inclusive-components.design/cards/#thepseudocontenttrick): the card
 * itself is a plain container with a real <h2> heading, and the heading's link
 * carries an ::after that covers the whole card — so the card is clickable while
 * the accessible link name is just the title, and screen-reader users can still
 * navigate the page by its headings. The card shows a focus ring via
 * `focus-within` when the link is focused.
 */
function AnalyticsCard({
  href,
  icon,
  title,
  description,
  children,
}: {
  href: string
  icon: ReactNode
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <Card
      hover={true}
      className={`${cardClassName} relative transition-all hover:scale-[1.02] focus-within:[outline:2px_solid_var(--ring-noeffect)] focus-within:[outline-offset:2px]`}
    >
      <Card.Header className={cardHeaderClassName}>
        <Card.Title className="flex items-center gap-2">
          {icon}
          <h2 style={{ font: 'inherit', color: 'inherit', margin: 0 }}>
            <Link
              href={href}
              className="outline-none after:absolute after:inset-0 after:content-['']"
            >
              {title}
            </Link>
          </h2>
        </Card.Title>
        <Card.Description>{description}</Card.Description>
      </Card.Header>
      <Card.Content className={cardContentClassName}>
        <div className="rounded-md border p-2">{children}</div>
      </Card.Content>
      <Card.Footer className={cardFooterClassName}>
        <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
          <span>View details</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </Card.Footer>
    </Card>
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

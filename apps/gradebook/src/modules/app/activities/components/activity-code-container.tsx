'use client'

import { Button, Container, Section, Tabs } from '@infonomic/uikit/react'

import { UpdateActivityCodeForm } from '@/modules/app/activities/components/update-activity-code-form'
import type { Locale } from '@/i18n/i18n-config'
import type { Activity, ActivityCode } from '../@types'

type ActivityCodeContainerProps = {
  activityCode: ActivityCode
  activities: Activity[]
  lng: Locale
}

export function ActivityCodeContainer({
  activityCode,
  activities,
  lng,
}: ActivityCodeContainerProps) {
  return (
    <Tabs defaultValue="detailsTab">
      <Tabs.List>
        <Tabs.Trigger value="detailsTab" render={<Button size="sm" />}>
          Details
        </Tabs.Trigger>
        <Tabs.Trigger value="membersTab" render={<Button size="sm" />}>
          Members
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="detailsTab" keepMounted={true}>
        <UpdateActivityCodeForm activityCode={activityCode} activities={activities} lng={lng} />
      </Tabs.Content>
      <Tabs.Content value="membersTab" keepMounted={true}>
        <p> Membership view and form here.... </p>
      </Tabs.Content>
    </Tabs>
  )
}

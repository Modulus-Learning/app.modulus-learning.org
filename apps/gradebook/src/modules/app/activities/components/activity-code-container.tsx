'use client'

import { useState } from 'react'

import { Button, Tabs } from '@infonomic/uikit/react'
import cx from 'classnames'

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
  const [currentTab, setCurrentTab] = useState<string>('detailsTab')

  const handleOnTabValueChange = (value: string) => {
    setCurrentTab(value)
  }

  return (
    <Tabs
      defaultValue="detailsTab"
      onValueChange={handleOnTabValueChange}
      className="p-0 overflow-hidden"
    >
      <Tabs.List className="p-0 border-t-0 border-r-0 gap-0 border-l-0 border-b-1 rounded-none">
        <Tabs.Trigger
          value="detailsTab"
          render={
            <Button
              className={cx(
                'rounded-none outline-none border-gray-300 dark:border-gray-400 border-t-0 border-r-0 border-l-0',
                {
                  'border-b-1 bg-gray-50 dark:bg-canvas-700': currentTab === 'detailsTab',
                }
              )}
              size="md"
              variant="text"
              intent="noeffect"
            />
          }
        >
          Details
        </Tabs.Trigger>
        <Tabs.Trigger
          value="membersTab"
          render={
            <Button
              className={cx(
                'rounded-none outline-none border-gray-300 dark:border-gray-400 border-t-0 border-r-0 border-l-0',
                {
                  'border-b-1  bg-gray-50 dark:bg-canvas-700': currentTab === 'membersTab',
                }
              )}
              size="md"
              variant="text"
              intent="noeffect"
            />
          }
        >
          Members
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="detailsTab" keepMounted={true} className="p-2">
        <UpdateActivityCodeForm activityCode={activityCode} activities={activities} lng={lng} />
      </Tabs.Content>
      <Tabs.Content value="membersTab" keepMounted={true}>
        <p> Membership view and form here.... </p>
      </Tabs.Content>
    </Tabs>
  )
}

import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { Card } from '@infonomic/uikit/react'

import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { useCourseLayout } from '@/ui/components/course-layout-provider'
import { ProgressBar } from '@/ui/components/lesson-progress-bar'
import { MultipleChoice } from '@/ui/components/multiple-choice'
import { UserDebugCard } from '@/ui/components/user-debug-card'

export const Route = createFileRoute('/_courses/calculus-2/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { setShowResetButton } = useCourseLayout()

  useEffect(() => {
    setShowResetButton(true)
    return () => setShowResetButton(false)
  }, [setShowResetButton])

  return (
    <div className="flex flex-col gap-8 items-center py-16 flex-1">
      <Breadcrumbs
        breadcrumbs={[{ label: 'Calculus 2', href: '/calculus-2' }]}
        className="self-start px-6"
      />
      <ProgressBar activityName="Activity 2" />
      <Card className="max-w-[400px] mx-auto">
        <MultipleChoice
          questionId="question-1"
          title="Problem 1"
          prompt="What comes next after 1, 2, 4, 8, 16, ...?"
          options={['7', '8', '31', '32']}
          answer={3}
          pointValue={1}
          totalPoints={4}
        />
      </Card>
      <Card className="max-w-[400px] mx-auto">
        <MultipleChoice
          questionId="question-2"
          title="Problem 2"
          prompt="What comes next after 1, 2, 4, 8, 16, ...?"
          options={['7', '8', '31', '32']}
          answer={2}
          pointValue={1}
          totalPoints={4}
        />
      </Card>
      <Card className="max-w-[400px] mx-auto">
        <MultipleChoice
          questionId="question-3"
          title="Problem 3"
          prompt="What comes next after 1, 1, 2, 3, 5, ...?"
          options={['7', '8', '31', '32']}
          answer={1}
          pointValue={1}
          totalPoints={4}
        />
      </Card>
      <Card className="max-w-[400px] mx-auto">
        <MultipleChoice
          questionId="question-4"
          title="Problem 4"
          prompt="What comes next after 1, 1, 2, 3, 5, ...?"
          options={['7', '8', '31', '32']}
          answer={0}
          pointValue={1}
          totalPoints={4}
        />
      </Card>
      <UserDebugCard />
    </div>
  )
}

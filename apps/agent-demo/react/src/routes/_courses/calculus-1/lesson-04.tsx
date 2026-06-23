import { useEffect, useSyncExternalStore } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { Card, Container, LoaderSpinner, Section } from '@infonomic/uikit/react'

import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { useCourseLayout } from '@/ui/components/course-layout-provider'
import { ProgressBar } from '@/ui/components/lesson-progress-bar'
import { MathJaxTypeset } from '@/ui/components/mathjax-typeset'
import { useModulus } from '@/ui/components/modulus-provider'
import { MultipleChoice } from '@/ui/components/multiple-choice'
import { useContributesTo } from '@/ui/components/use-contributes-to'
import { UserDebugCard } from '@/ui/components/user-debug-card'

const TOTAL_POINTS = 3

export const Route = createFileRoute('/_courses/calculus-1/lesson-04')({
  component: RouteComponent,
})

function RouteComponent() {
  const { modulus } = useModulus()

  const modulusIsReady = useSyncExternalStore(
    (cb) => modulus.on('ready', cb),
    () => modulus.isReady()
  )
  const { setShowResetButton } = useCourseLayout()

  // This lesson is one of twelve units in Calculus 1; at full marks it
  // contributes one twelfth of the course index page's cumulative progress.
  useContributesTo({ url: '/calculus-1', factor: 1 / 12 })

  useEffect(() => {
    setShowResetButton(true)
    return () => setShowResetButton(false)
  }, [setShowResetButton])

  return (
    <Section className="relative">
      {!modulusIsReady && (
        <div className="absolute inset-0 z-10 flex justify-center bg-black/80">
          <LoaderSpinner
            className="relative top-[30vh] text-gray-900 dark:text-white"
            size="48px"
          />
        </div>
      )}
      <Container className="flex flex-col gap-8 items-center py-16 flex-1 max-w-[800px]">
        <Breadcrumbs
          breadcrumbs={[
            { label: 'Calculus 1', href: '/calculus-1' },
            { label: 'Average rate of change', href: '/calculus-1/lesson-04' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Average rate of change" />

        <Card>
          <MathJaxTypeset deps={['intro-04']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">Average rate of change</h2>
            <p>
              The <strong>average rate of change</strong> of a function {String.raw`\(f\)`} over an
              interval {String.raw`\([a, b]\)`} measures how much the output changes per unit of
              input. Geometrically it is the slope of the <em>secant line</em> joining the points{' '}
              {String.raw`\((a, f(a))\)`} and {String.raw`\((b, f(b))\)`}:
            </p>
            <div className="text-center text-lg">
              <p>{String.raw`$$\frac{f(b) - f(a)}{b - a}$$`}</p>
            </div>
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt="The average rate of change of a function over an interval is best described as:"
              options={[
                'The slope of the tangent line at the left endpoint',
                'The slope of the secant line through the endpoints',
                'The value of the function at the right endpoint',
                'The area under the function over the interval',
              ]}
              answer={1}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="vertical"
            />
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q2']} className="flex flex-col">
            <MultipleChoice
              questionId="2"
              marker="02"
              title="Problem 2"
              prompt={String.raw`For \(f(x) = x^2\), what is the average rate of change on \([1, 3]\)?`}
              options={['2', '3', '4', '8']}
              answer={2}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="horizontal"
            />
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q3']} className="flex flex-col">
            <MultipleChoice
              questionId="3"
              marker="03"
              title="Problem 3"
              prompt={String.raw`As the interval \([a, b]\) shrinks so that \(b \to a\), the average rate of change approaches:`}
              options={[
                'The instantaneous rate of change at a',
                'Zero, always',
                'The maximum value of f',
                'The y-intercept of f',
              ]}
              answer={0}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="vertical"
            />
          </MathJaxTypeset>
        </Card>

        <UserDebugCard />
      </Container>
    </Section>
  )
}

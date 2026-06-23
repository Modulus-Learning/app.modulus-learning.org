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

export const Route = createFileRoute('/_courses/calculus-1/lesson-05')({
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
            { label: 'Estimating limits', href: '/calculus-1/lesson-05' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Estimating limits" />

        <Card>
          <MathJaxTypeset deps={['intro-05']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">Estimating limits</h2>
            <p>
              When we cannot evaluate a function directly at a point, we can{' '}
              <strong>estimate the limit</strong> by examining the value of {String.raw`\(f(x)\)`}{' '}
              as {String.raw`\(x\)`} approaches the point from both sides — numerically with a table
              of values, or graphically by tracing the curve.
            </p>
            <div className="text-center text-lg">
              <p>{String.raw`$$\lim_{x \to a} f(x) = L$$`}</p>
            </div>
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt={String.raw`To estimate \(\lim_{x \to 2} f(x)\) numerically, the best approach is to:`}
              options={[
                'Evaluate f(2) directly',
                'Build a table of f(x) for x close to 2 from both sides',
                'Find the maximum of f',
                'Differentiate f and set it to zero',
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
              prompt={String.raw`A table shows \(f(x) \to 3\) as \(x \to 1\) from the left and \(f(x) \to 3\) from the right. What can you conclude about \(\lim_{x \to 1} f(x)\)?`}
              options={['It does not exist', 'It equals 3', 'It equals f(1)', 'It equals 1']}
              answer={1}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="vertical"
            />
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q3']} className="flex flex-col">
            <MultipleChoice
              questionId="3"
              marker="03"
              title="Problem 3"
              prompt="If the left-hand and right-hand limits at a point disagree, then the (two-sided) limit there:"
              options={[
                'Equals their average',
                'Equals the larger of the two',
                'Does not exist',
                'Is always zero',
              ]}
              answer={2}
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

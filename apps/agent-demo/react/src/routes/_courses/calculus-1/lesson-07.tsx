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

export const Route = createFileRoute('/_courses/calculus-1/lesson-07')({
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
            { label: 'Continuity', href: '/calculus-1/lesson-07' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Continuity" />

        <Card>
          <MathJaxTypeset deps={['intro-07']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">Continuity</h2>
            <p>
              A function {String.raw`\(f\)`} is <strong>continuous</strong> at{' '}
              {String.raw`\(x = a\)`} when there is no break, jump, or hole there — formally, when
              the limit as {String.raw`\(x \to a\)`} exists and equals the function&apos;s value:
            </p>
            <div className="text-center text-lg">
              <p>{String.raw`$$\lim_{x \to a} f(x) = f(a)$$`}</p>
            </div>
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt={String.raw`Which condition must hold for \(f\) to be continuous at \(x = a\)?`}
              options={[
                String.raw`\(f(a)\) is defined`,
                String.raw`\(\lim_{x \to a} f(x)\) exists`,
                String.raw`\(\lim_{x \to a} f(x) = f(a)\)`,
                String.raw`\(f\) is increasing at \(a\)`,
              ]}
              answer={2}
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
              prompt={String.raw`How would you classify the discontinuity of \(f(x) = \dfrac{x^2 - 4}{x - 2}\) at \(x = 2\)?`}
              options={[
                'Continuous everywhere — no discontinuity',
                'A removable discontinuity (a hole)',
                'A jump discontinuity',
                'An infinite discontinuity',
              ]}
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
              prompt="The Intermediate Value Theorem applies to a function that is:"
              options={[
                'Differentiable everywhere',
                'Continuous on a closed interval',
                'A polynomial only',
                'Strictly increasing',
              ]}
              answer={1}
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

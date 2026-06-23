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

export const Route = createFileRoute('/_courses/calculus-1/lesson-09')({
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
            { label: 'Derivatives from first principles', href: '/calculus-1/lesson-09' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Derivatives from first principles" />

        <Card>
          <MathJaxTypeset deps={['intro-09']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">Derivatives from first principles</h2>
            <p>
              The <strong>derivative</strong> measures the instantaneous rate of change of a
              function. We define it as the limit of the average rate of change as the interval
              shrinks to zero — the slope of the tangent line:
            </p>
            <div className="text-center text-lg">
              <p>{String.raw`$$f'(x) = \lim_{h \to 0} \frac{f(x + h) - f(x)}{h}$$`}</p>
            </div>
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt={String.raw`Which expression is the limit definition of the derivative \(f'(x)\)?`}
              options={[
                String.raw`\(\dfrac{f(b) - f(a)}{b - a}\)`,
                String.raw`\(\lim_{h \to 0} \dfrac{f(x + h) - f(x)}{h}\)`,
                String.raw`\(\dfrac{f(x)}{x}\)`,
                String.raw`\(\lim_{x \to 0} f(x)\)`,
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
              prompt={String.raw`Applying the limit definition to \(f(x) = x^2\), the derivative \(f'(x)\) is:`}
              options={[String.raw`\(x\)`, String.raw`\(2x\)`, String.raw`\(x^2\)`, '2']}
              answer={1}
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
              prompt={String.raw`Geometrically, \(f'(a)\) represents:`}
              options={[
                'The area under f',
                'The slope of the tangent line at x = a',
                'The average rate of change on [0, a]',
                'The value f(a)',
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

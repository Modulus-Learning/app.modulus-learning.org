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

export const Route = createFileRoute('/_courses/calculus-1/lesson-06')({
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
            { label: 'Infinite limits', href: '/calculus-1/lesson-06' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Infinite limits" />

        <Card>
          <MathJaxTypeset deps={['intro-06']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">Infinite limits</h2>
            <p>
              Sometimes a function grows without bound as {String.raw`\(x\)`} approaches a value. We
              write {String.raw`\(\lim_{x \to a} f(x) = \pm\infty\)`} to describe this behavior.
              When this happens, the line {String.raw`\(x = a\)`} is a{' '}
              <strong>vertical asymptote</strong> of the graph.
            </p>
            <div className="text-center text-lg">
              <p>{String.raw`$$\lim_{x \to 0} \frac{1}{x^2} = +\infty$$`}</p>
            </div>
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt={String.raw`Evaluate \(\lim_{x \to 0} \dfrac{1}{x^2}\).`}
              options={['0', '1', String.raw`\(+\infty\)`, 'Does not exist (oscillates)']}
              answer={2}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="horizontal"
            />
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q2']} className="flex flex-col">
            <MultipleChoice
              questionId="2"
              marker="02"
              title="Problem 2"
              prompt={String.raw`A function \(f\) has a vertical asymptote at \(x = a\) exactly when:`}
              options={[
                String.raw`\(f(a) = 0\)`,
                String.raw`the limit of \(f\) as \(x \to a\) is \(\pm\infty\)`,
                String.raw`\(f\) is continuous at \(a\)`,
                String.raw`\(f(a)\) is a large number`,
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
              prompt={String.raw`Evaluate the one-sided limit \(\lim_{x \to 0^+} \dfrac{1}{x}\).`}
              options={[String.raw`\(-\infty\)`, '0', String.raw`\(+\infty\)`, '1']}
              answer={2}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="horizontal"
            />
          </MathJaxTypeset>
        </Card>

        <UserDebugCard />
      </Container>
    </Section>
  )
}

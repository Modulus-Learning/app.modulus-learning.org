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

export const Route = createFileRoute('/_courses/calculus-1/lesson-12')({
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
            { label: 'Chain rule', href: '/calculus-1/lesson-12' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Chain rule" />

        <Card>
          <MathJaxTypeset deps={['intro-12']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">Chain rule</h2>
            <p>
              The <strong>chain rule</strong> differentiates a composition of functions: take the
              derivative of the outer function (evaluated at the inner) and multiply by the
              derivative of the inner function:
            </p>
            <div className="text-center text-lg">
              <p>{String.raw`$$\frac{d}{dx}\,f\bigl(g(x)\bigr) = f'\bigl(g(x)\bigr)\,g'(x)$$`}</p>
            </div>
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt={String.raw`The chain rule says \(\dfrac{d}{dx}\,f\bigl(g(x)\bigr)\) equals:`}
              options={[
                String.raw`\(f'\bigl(g(x)\bigr)\)`,
                String.raw`\(f'\bigl(g(x)\bigr)\,g'(x)\)`,
                String.raw`\(f'(x)\,g'(x)\)`,
                String.raw`\(f\bigl(g'(x)\bigr)\)`,
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
              prompt={String.raw`Differentiate \((3x + 1)^5\).`}
              options={[
                String.raw`\(5(3x + 1)^4\)`,
                String.raw`\(15(3x + 1)^4\)`,
                String.raw`\(5(3x + 1)^4 \cdot 3x\)`,
                String.raw`\((3x + 1)^4\)`,
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
              prompt={String.raw`Differentiate \(\sin(x^2)\).`}
              options={[
                String.raw`\(\cos(x^2)\)`,
                String.raw`\(2x \cos(x^2)\)`,
                String.raw`\(2x \sin(x^2)\)`,
                String.raw`\(\cos(2x)\)`,
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

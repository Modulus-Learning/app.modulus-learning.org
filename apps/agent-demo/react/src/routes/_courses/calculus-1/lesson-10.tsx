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

const TOTAL_POINTS = 4

export const Route = createFileRoute('/_courses/calculus-1/lesson-10')({
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
            { label: 'Derivative rules', href: '/calculus-1/lesson-10' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Derivative rules" />

        <Card>
          <MathJaxTypeset deps={['intro-10']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">Derivative rules</h2>
            <p>
              Computing every derivative from first principles is tedious. The{' '}
              <strong>power rule</strong>, together with the constant-multiple and sum rules, lets
              us differentiate polynomials quickly:
            </p>
            <div className="text-center text-lg">
              <p>{String.raw`$$\frac{d}{dx}\left[x^n\right] = n\,x^{n-1}$$`}</p>
            </div>
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt={String.raw`According to the power rule, \(\dfrac{d}{dx}\left[x^n\right]\) equals:`}
              options={[
                String.raw`\(n\,x^{n-1}\)`,
                String.raw`\(x^{n-1}\)`,
                String.raw`\(n\,x^{n}\)`,
                String.raw`\((n-1)\,x^{n}\)`,
              ]}
              answer={0}
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
              prompt={String.raw`Differentiate \(f(x) = 5x^3\).`}
              options={[
                String.raw`\(15x^2\)`,
                String.raw`\(5x^2\)`,
                String.raw`\(15x^3\)`,
                String.raw`\(3x^2\)`,
              ]}
              answer={0}
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
              prompt={String.raw`What is the derivative of a constant \(c\)?`}
              options={[String.raw`\(c\)`, '1', '0', String.raw`\(x\)`]}
              answer={2}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="horizontal"
            />
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q4']} className="flex flex-col">
            <MultipleChoice
              questionId="4"
              marker="04"
              title="Problem 4"
              prompt={String.raw`Differentiate \(f(x) = 3x^2 + 2x\).`}
              options={[
                String.raw`\(6x + 2\)`,
                String.raw`\(3x + 2\)`,
                String.raw`\(6x\)`,
                String.raw`\(5x\)`,
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

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

export const Route = createFileRoute('/_courses/calculus-1/lesson-08')({
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
            { label: 'Limits at infinity', href: '/calculus-1/lesson-08' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Limits at infinity" />

        <Card>
          <MathJaxTypeset deps={['intro-08']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">Limits at infinity</h2>
            <p>
              A <strong>limit at infinity</strong> describes the end behavior of a function — what
              happens to {String.raw`\(f(x)\)`} as {String.raw`\(x \to \pm\infty\)`}. When the
              function settles toward a finite value {String.raw`\(L\)`}, the line{' '}
              {String.raw`\(y = L\)`} is a <strong>horizontal asymptote</strong>.
            </p>
            <div className="text-center text-lg">
              <p>{String.raw`$$\lim_{x \to \infty} \frac{3x^2 + 1}{x^2 - 5} = 3$$`}</p>
            </div>
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt={String.raw`Evaluate \(\lim_{x \to \infty} \dfrac{3x^2 + 1}{x^2 - 5}\).`}
              options={['0', '1', '3', String.raw`\(\infty\)`]}
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
              prompt="A horizontal asymptote describes the behavior of a function as:"
              options={[
                String.raw`\(x\) approaches a finite value \(a\)`,
                String.raw`\(x \to \pm\infty\)`,
                String.raw`\(f(x) \to 0\)`,
                String.raw`\(x = 0\)`,
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
              prompt={String.raw`Evaluate \(\lim_{x \to \infty} \dfrac{1}{x}\).`}
              options={['1', String.raw`\(\infty\)`, '0', '−1']}
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

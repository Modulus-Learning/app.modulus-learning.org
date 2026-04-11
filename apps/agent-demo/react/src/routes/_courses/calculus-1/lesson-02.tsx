import { useEffect, useSyncExternalStore } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { Card, Container, LoaderSpinner, Section } from '@infonomic/uikit/react'

import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { useCourseLayout } from '@/ui/components/course-layout-provider'
import { ProgressBar } from '@/ui/components/lesson-progress-bar'
import { MathJaxTypeset } from '@/ui/components/mathjax-typeset'
import { useModulus } from '@/ui/components/modulus-provider'
import { MultipleChoice } from '@/ui/components/multiple-choice'
import { UserDebugCard } from '@/ui/components/user-debug-card'

const TOTAL_POINTS = 3

export const Route = createFileRoute('/_courses/calculus-1/lesson-02')({
  component: RouteComponent,
})

function RouteComponent() {
  const { modulus } = useModulus()

  const modulusIsReady = useSyncExternalStore(
    (cb) => modulus.on('ready', cb),
    () => modulus.isReady()
  )
  const { setShowResetButton } = useCourseLayout()

  useEffect(() => {
    setShowResetButton(true)
    return () => setShowResetButton(false)
  }, [setShowResetButton])

  const termOptions = [
    String.raw`\(-1\)`,
    String.raw`\(x^2\)`,
    String.raw`\(5x^3\)`,
    String.raw`\(-5x^4\)`,
    String.raw`\(-5x^5\)`,
    String.raw`\(5x^6\)`,
  ]

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
            { label: 'Review of famous functions', href: '/calculus-1/lesson-02' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Review of famous functions" />

        {/* Introductory context */}
        <Card>
          <MathJaxTypeset deps={['review-famous-functions']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">
              Two young mathematicians think about &ldquo;How crazy could it be?&rdquo;
            </h2>
            <p>Check out this dialogue between two calculus students (based on a true story):</p>
            <blockquote className="border-l-4 border-gray-400 pl-4 italic text-gray-300">
              <p className="mb-2">
                <strong>Devyn:</strong> Riley, do you remember when we first started graphing
                functions? Like with a &ldquo;T-chart?&rdquo;
              </p>
              <p className="mb-2">
                <strong>Riley:</strong> I remember everything.
              </p>
              <p className="mb-2">
                <strong>Devyn:</strong> I used to get so excited to plot stuff! I would wonder:
                &ldquo;What crazy curve would be drawn this time? What crazy picture will I
                see?&rdquo;
              </p>
              <p className="mb-2">
                <strong>Riley:</strong> Then we learned about the slope-intercept form of a line.
                Good-old {String.raw`\(y = mx + b\)`}.
              </p>
              <p className="mb-2">
                <strong>Devyn:</strong> Yeah, but lines are really boring. What about polynomials?
                What could you tell me about
              </p>
            </blockquote>
            <div className="text-center text-lg">
              <p>{String.raw`$$y = 5x^6 - 5x^5 - 5x^4 + 5x^3 + x^2 - 1$$`}</p>
            </div>
            <blockquote className="border-l-4 border-gray-400 pl-4 italic text-gray-300">
              <p className="mb-2">
                <strong>Devyn:</strong> &hellip;just by looking at the equation?
              </p>
              <p>
                <strong>Riley:</strong> Hmmmm. I&apos;m not sure&hellip;
              </p>
            </blockquote>
          </MathJaxTypeset>
        </Card>

        {/* Question 1 */}
        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt={String.raw`When \(x\) is a large number (furthest from zero), which term of \(5x^6 - 5x^5 - 5x^4 + 5x^3 + x^2 - 1\) is largest (furthest from zero)?`}
              options={termOptions}
              answer={5}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="horizontal"
            />
          </MathJaxTypeset>
        </Card>

        {/* Question 2 */}
        <Card>
          <MathJaxTypeset deps={['q2']} className="flex flex-col">
            <MultipleChoice
              questionId="2"
              marker="02"
              title="Problem 2"
              prompt={String.raw`When \(x\) is a small number (near zero), which term of \(5x^6 - 5x^5 - 5x^4 + 5x^3 + x^2 - 1\) is largest (furthest from zero)?`}
              options={termOptions}
              answer={0}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="horizontal"
            />
          </MathJaxTypeset>
        </Card>

        {/* Question 3 */}
        <Card>
          <MathJaxTypeset deps={['q3']} className="flex flex-col">
            <MultipleChoice
              questionId="3"
              marker="03"
              title="Problem 3"
              prompt={String.raw`Very roughly speaking, what does the graph of \(y = 5x^6 - 5x^5 - 5x^4 + 5x^3 + x^2 - 1\) look like?`}
              options={[
                'The graph starts in the lower left and ends in the upper right of the plane.',
                'The graph starts in the lower right and ends in the upper left of the plane.',
                'The graph looks something like the letter "U."',
                'The graph looks something like an upside down letter "U."',
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

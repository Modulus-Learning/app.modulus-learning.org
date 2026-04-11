import { useEffect, useSyncExternalStore } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { Card, Container, LoaderSpinner, Section } from '@infonomic/uikit/react'

import { BooleanQuestion } from '@/ui/components/boolean-question'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { useCourseLayout } from '@/ui/components/course-layout-provider'
import { ProgressBar } from '@/ui/components/lesson-progress-bar'
import { MathJaxTypeset } from '@/ui/components/mathjax-typeset'
import { useModulus } from '@/ui/components/modulus-provider'
import { MultipleChoice } from '@/ui/components/multiple-choice'
import { UserDebugCard } from '@/ui/components/user-debug-card'

const TOTAL_POINTS = 4

export const Route = createFileRoute('/_courses/calculus-1/lesson-01')({
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
            { label: 'Understanding functions', href: '/calculus-1/lesson-01' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Understanding functions" />

        {/* Introductory context */}
        <Card>
          <MathJaxTypeset deps={['understanding-functions']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">
              Two young mathematicians think about &ldquo;functions&rdquo;
            </h2>
            <p>Check out this dialogue between two calculus students (based on a true story):</p>
            <blockquote className="border-l-4 border-gray-400 pl-4 italic text-gray-300">
              <p className="mb-2">
                <strong>First Student:</strong> I&apos;ve been thinking about functions. I think
                that a function is basically a relation between sets that assigns to each element of
                an input set exactly one element of an output set.
              </p>
              <p className="mb-2">
                <strong>Second Student:</strong> Hmm, but I think of functions as a formula, like{' '}
                {String.raw`\(f(x) = x^2\)`}.
              </p>
              <p>
                <strong>First Student:</strong> I think it&apos;s more subtle than that. Consider
                the following two functions:
              </p>
            </blockquote>
            <div className="text-center text-lg">
              <p>{String.raw`$$f(x) = (x+1)(x-1)$$`}</p>
              <p>{String.raw`$$g(x) = x^2 - 1$$`}</p>
            </div>
            <p>
              Are {String.raw`\(f\)`} and {String.raw`\(g\)`} the same function or different
              functions?
            </p>
          </MathJaxTypeset>
        </Card>

        {/* Question 1 */}
        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <BooleanQuestion
              questionId="1"
              marker="01"
              title="Problem 1"
              answer={true}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
            >
              <p>
                In the context above, are {String.raw`\(f\)`} and {String.raw`\(g\)`} the same
                function?
              </p>
            </BooleanQuestion>
          </MathJaxTypeset>
        </Card>

        {/* Question 2 */}
        <Card>
          <MathJaxTypeset deps={['q2']} className="flex flex-col">
            <BooleanQuestion
              questionId="2"
              marker="02"
              title="Problem 2"
              answer={false}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
            >
              <p>
                Suppose {String.raw`\(f\)`} and {String.raw`\(g\)`} are functions but the domain of{' '}
                {String.raw`\(f\)`} is different from the domain of {String.raw`\(g\)`}. Could it be
                that {String.raw`\(f\)`} and {String.raw`\(g\)`} are actually the same function?
              </p>
            </BooleanQuestion>
          </MathJaxTypeset>
        </Card>

        {/* Question 3 */}
        <Card>
          <MathJaxTypeset deps={['q3']} className="flex flex-col">
            <BooleanQuestion
              questionId="3"
              marker="03"
              title="Problem 3"
              answer={true}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
            >
              <p>Can the same function be represented by different formulas?</p>
            </BooleanQuestion>
          </MathJaxTypeset>
        </Card>

        {/* Question 4 — Multiple Choice */}
        <Card>
          <MathJaxTypeset deps={['q4']} className="flex flex-col">
            <MultipleChoice
              questionId="4"
              marker="04"
              title="Problem 4"
              prompt={String.raw`Let \(f(x) = \sin^2(x)\) and \(g(u) = \sin^2(u)\). The domain of each of these functions is all real numbers. Which of the following statements is true?`}
              options={[
                'There is not enough information to determine if f = g',
                'The functions are equal',
                'If x ≠ u, then f ≠ g',
                'We have f ≠ g since f uses the variable x and g uses the variable u',
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

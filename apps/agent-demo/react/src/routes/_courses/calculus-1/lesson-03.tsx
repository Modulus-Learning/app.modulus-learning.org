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

const TOTAL_POINTS = 2

export const Route = createFileRoute('/_courses/calculus-1/lesson-03')({
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
            { label: 'Stars and functions', href: '/calculus-1/lesson-03' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Stars and functions" />

        {/* Introductory context */}
        <Card>
          <MathJaxTypeset deps={['stars-and-functions']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">
              Two young mathematicians discuss stars and functions
            </h2>
            <p>Check out this dialogue between two calculus students (based on a true story):</p>
            <blockquote className="border-l-4 border-gray-400 pl-4 italic text-gray-300">
              <p className="mb-2">
                <strong>Devyn:</strong> Riley, did you know I like looking at the stars at night?
              </p>
              <p className="mb-2">
                <strong>Riley:</strong> Stars are freaking awesome balls of nuclear fire whose light
                took thousands of years to reach us.
              </p>
              <p className="mb-2">
                <strong>Devyn:</strong> I know! But did you know that the best way to see a very dim
                star is to look near it but not exactly at it? It&apos;s because then you can use
                the &ldquo;rods&rdquo; in your eye, which work better in low light than the
                &ldquo;cones&rdquo; in your eyes.
              </p>
              <p className="mb-2">
                <strong>Riley:</strong> That&apos;s amazing! Hey, that reminds me of when we were
                talking about the two functions
              </p>
            </blockquote>
            <div className="text-center text-lg">
              <p>{String.raw`$$f(x) = \frac{x^2 - 3x + 2}{x - 2} \qquad \text{and} \qquad g(x) = x - 1$$`}</p>
            </div>
            <blockquote className="border-l-4 border-gray-400 pl-4 italic text-gray-300">
              <p className="mb-2">
                <strong>Riley:</strong> &hellip;which we now know are completely different functions.
              </p>
              <p className="mb-2">
                <strong>Devyn:</strong> Whoa. How are you seeing a connection here?
              </p>
              <p className="mb-2">
                <strong>Riley:</strong> If we want to understand what is happening with the function{' '}
                {String.raw`\(f(x) = \frac{x^2 - 3x + 2}{x - 2}\)`} at {String.raw`\(x = 2\)`},
                we can&apos;t do it by setting {String.raw`\(x = 2\)`}. Instead we need to look
                near {String.raw`\(x = 2\)`} but not exactly at {String.raw`\(x = 2\)`}.
              </p>
              <p>
                <strong>Devyn:</strong> Ah ha! Because if we are not exactly at{' '}
                {String.raw`\(x = 2\)`}, then{' '}
                {String.raw`\(\frac{x^2 - 3x + 2}{x - 2} = x - 1\)`}.
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
              prompt={String.raw`Let \(f(x) = \frac{x^2 - 3x + 2}{x - 2}\) and \(g(x) = x - 1\). Which of the following is true?`}
              options={[
                'f(x) = g(x) for every value of x.',
                'There is no x-value where f(x) = g(x).',
                'f(x) = g(x) when x ≠ 2.',
              ]}
              answer={2}
              pointValue={1}
              totalPoints={TOTAL_POINTS}
              orientation="vertical"
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
              prompt={String.raw`When you evaluate \(f(x) = \frac{x^2 - 3x + 2}{x - 2}\) at \(x\)-values approaching (but not equal to) \(2\), what does the value of \(f(x)\) approach?`}
              options={['0', '1', '2', 'Does not exist']}
              answer={1}
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

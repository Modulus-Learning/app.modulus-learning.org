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

export const Route = createFileRoute('/_courses/calculus-1/lesson-11')({
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
            { label: 'Product and quotient rules', href: '/calculus-1/lesson-11' },
          ]}
          className="self-start"
        />
        <ProgressBar activityName="Product and quotient rules" />

        <Card>
          <MathJaxTypeset deps={['intro-11']} className="p-5 flex flex-col gap-4">
            <h2 className="text-3xl font-bold">Product and quotient rules</h2>
            <p>
              The derivative of a product is <em>not</em> the product of the derivatives. Instead we
              use the <strong>product rule</strong> and, for ratios, the{' '}
              <strong>quotient rule</strong>:
            </p>
            <div className="text-center text-lg">
              <p>{String.raw`$$(fg)' = f'g + fg' \qquad \left(\frac{f}{g}\right)' = \frac{f'g - fg'}{g^2}$$`}</p>
            </div>
          </MathJaxTypeset>
        </Card>

        <Card>
          <MathJaxTypeset deps={['q1']} className="flex flex-col">
            <MultipleChoice
              questionId="1"
              marker="01"
              title="Problem 1"
              prompt={String.raw`The product rule says that \((fg)'\) equals:`}
              options={[
                String.raw`\(f'g'\)`,
                String.raw`\(f'g + fg'\)`,
                String.raw`\(f'g - fg'\)`,
                String.raw`\(fg'\)`,
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
              prompt={String.raw`The quotient rule says that \(\left(\dfrac{f}{g}\right)'\) equals:`}
              options={[
                String.raw`\(\dfrac{f'g - fg'}{g^2}\)`,
                String.raw`\(\dfrac{f'g + fg'}{g^2}\)`,
                String.raw`\(\dfrac{f'}{g'}\)`,
                String.raw`\(\dfrac{fg' - f'g}{g^2}\)`,
              ]}
              answer={0}
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
              prompt={String.raw`Use the product rule to differentiate \(x^2 \sin x\).`}
              options={[
                String.raw`\(2x \sin x\)`,
                String.raw`\(2x \cos x\)`,
                String.raw`\(2x \sin x + x^2 \cos x\)`,
                String.raw`\(x^2 \cos x\)`,
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

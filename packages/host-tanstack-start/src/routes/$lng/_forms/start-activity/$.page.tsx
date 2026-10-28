import { getRouteApi, useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { usePathname } from '@/framework/index'
import { StartActivity } from '@/modules/app/activity/components/start-activity'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

const formsLayout = getRouteApi('/$lng/_forms')

function StartActivityPage() {
  const { lng } = useParams({ strict: false })
  const { go, destinationURL, result } = useLoaderData({ strict: false })
  const { session } = formsLayout.useLoaderData()
  // The visible path, as the Next proxy's X-Current-Path header carried it.
  const currentPath = usePathname()

  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            lng={lng}
            breadcrumbs={[{ label: 'Start Activity', href: '/start-activity' }]}
          />
        </Container>
      </Section>
      {destinationURL == null || result == null ? (
        <Section>
          <Container className="sm:px-8">
            <h1 className="mb-4">Start Activity</h1>
            <p>Invalid or missing parameters</p>
            <p>Parameters: {go.length > 0 ? go.join(' ') : ''} </p>
          </Container>
        </Section>
      ) : (
        <Section>
          <Container className="mb-8">
            <h1 className="mb-4">Welcome to Modulus</h1>
            <StartActivity
              lng={lng}
              session={session}
              currentPath={currentPath}
              destinationURL={destinationURL}
              startActivityResult={result}
            />
          </Container>
        </Section>
      )}
    </>
  )
}

export const Page = StartActivityPage

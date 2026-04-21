import type React from 'react'
import { headers } from 'next/headers'

import { Container, Section } from '@infonomic/uikit/react'

import { StartActivity } from '@/modules/app/activity/components/start-activity'
import { startActivity } from '@/modules/app/activity/start-activity'
import { getUserSession } from '@/modules/app/session/storage'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

function extractParameters(params: string[]): Record<string, string | null> {
  const receivedParams = [...params]
  if (receivedParams.length > 0) {
    const activityCode = receivedParams[0]
    receivedParams.shift()
    let destinationURL = decodeURIComponent(receivedParams.join('/'))
    // Next.js specific fixup. There is no way to prevent
    // Next.js from 'normalizing' URLs to remove double
    // forward slashes - and so we have to put them back here.
    destinationURL = destinationURL.replace('http:/', 'http://').replace('https:/', 'https://')
    return { activityCode, destinationURL }
  }
  return { activityCode: null, destinationURL: null }
}

// Four possible component results
// 1. Missing parameters
// 2. Needs user (sign in or registration form)
// 3. Success (interstitial)
// 4. Failed (error message)

export default async function StartActivityPage({
  params,
}: {
  params: Promise<{ lng: Locale; go: string[] }>
}): Promise<React.JSX.Element> {
  const { lng, go } = await params
  const { activityCode, destinationURL } = extractParameters(go)
  const session = await getUserSession()
  const pathname = (await headers()).get('X-Current-Path')

  if (
    activityCode == null ||
    activityCode.length === 0 ||
    destinationURL == null ||
    destinationURL.length === 0
  ) {
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

        <Section>
          <Container className="sm:px-8">
            <h1 className="mb-4">Start Activity</h1>
            <p>Invalid or missing parameters</p>
            <p>Parameters: {go.length > 0 ? go.join(' ') : ''} </p>
          </Container>
        </Section>
      </>
    )
  }

  // We'll only call our startActivity server function if
  // we have valid parameters.
  const result = await startActivity(activityCode, destinationURL)

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

      <Section>
        <Container className="mb-8">
          <h1 className="mb-4">Welcome to Modulus</h1>
          <StartActivity
            lng={lng}
            session={session}
            currentPath={pathname}
            destinationURL={destinationURL}
            startActivityResult={result}
          />
          {/* <p>Parameters: {go.length > 0 ? go.join(' ') : ''} </p> */}
        </Container>
      </Section>
    </>
  )
}

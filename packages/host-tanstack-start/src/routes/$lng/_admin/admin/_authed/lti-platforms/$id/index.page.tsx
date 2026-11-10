import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { LtiPlatformDetailsView } from '@/modules/admin/lti-platforms/components/details-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { id, lng } = useParams({ strict: false })
  const { data } = useLoaderData({ strict: false })
  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[
              { label: 'LTI Platforms', href: '/admin/lti-platforms' },
              { label: 'LTI Platform', href: '/admin/lti-platforms/id' },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.platform?.name}</h1>
          <LtiPlatformDetailsView lng={lng} data={data} mode="view" />
        </Container>
      </Section>
    </>
  )
}

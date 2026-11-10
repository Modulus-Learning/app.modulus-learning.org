import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { LtiPlatformsListView } from '@/modules/admin/lti-platforms/components/list-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { lng } = useParams({ strict: false })
  const { data } = useLoaderData({ strict: false })
  return (
    <>
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs
            homeLabel="Admin"
            homePath="/admin"
            lng={lng}
            breadcrumbs={[{ label: 'LTI Platforms', href: '/admin/lti-platforms' }]}
          />
        </Container>
      </Section>
      <LtiPlatformsListView lng={lng} data={data} />
    </>
  )
}

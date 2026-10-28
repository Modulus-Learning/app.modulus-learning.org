import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { LtiPlatformDetailsView } from '@modulus-learning/host-tanstack-start/modules/admin/lti-platforms/components/details-view'
import { getLtiPlatform } from '@modulus-learning/host-tanstack-start/modules/admin/lti-platforms/get'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/lti-platforms/$id/')({
  loader: async ({ params }) => {
    const { id, lng } = params
    const data = await getLtiPlatform(id, lng)

    if (data?.platform == null) throw notFound()
    return { data: { ...data, platform: data.platform } }
  },
  component: function Page() {
    const { id, lng } = Route.useParams()
    const { data } = Route.useLoaderData()
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
  },
})

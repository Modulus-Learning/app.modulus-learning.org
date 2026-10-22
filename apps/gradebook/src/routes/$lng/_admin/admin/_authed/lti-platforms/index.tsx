import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { LtiPlatformsListView } from '@/modules/admin/lti-platforms/components/list-view'
import { listLtiPlatforms } from '@/modules/admin/lti-platforms/list'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/lti-platforms/')({
  loader: async ({ params }) => {
    const { lng } = params

    const data = await listLtiPlatforms(lng)
    return { data }
  },
  component: function Page() {
    const { lng } = Route.useParams()
    const { data } = Route.useLoaderData()
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
  },
})

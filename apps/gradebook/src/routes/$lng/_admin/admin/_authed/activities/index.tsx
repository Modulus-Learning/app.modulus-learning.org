import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AllowlistRulesListView } from '@/modules/admin/activity-url-allowlist/components/list-view'
import { listAllowlistRules } from '@/modules/admin/activity-url-allowlist/list'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/activities/')({
  loader: async ({ params }) => {
    const { lng } = params
    const data = await listAllowlistRules(lng)
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
              breadcrumbs={[{ label: 'Activities', href: '/admin/activities' }]}
            />
          </Container>
        </Section>
        <AllowlistRulesListView data={data} lng={lng} />
      </>
    )
  },
})

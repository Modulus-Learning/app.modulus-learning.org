import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { AllowlistRuleEditForm } from '@modulus-learning/host-tanstack-start/modules/admin/activity-url-allowlist/components/edit-form'
import { getAllowlistRule } from '@modulus-learning/host-tanstack-start/modules/admin/activity-url-allowlist/get'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/activities/$id/edit')({
  loader: async ({ params }) => {
    const { id, lng } = params
    const data = await getAllowlistRule(id, lng)

    if (data?.rule == null) throw notFound()
    return { data: { ...data, rule: data.rule } }
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
                { label: 'Activities', href: '/admin/activities' },
                { label: 'Edit Rule', href: `/admin/activities/${data.rule.id}/edit` },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <AllowlistRuleEditForm lng={lng} rule={data.rule} />
          </Container>
        </Section>
      </>
    )
  },
})

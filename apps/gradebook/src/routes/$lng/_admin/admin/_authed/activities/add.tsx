import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { AllowlistRuleCreateForm } from '@modulus-learning/host-tanstack-start/modules/admin/activity-url-allowlist/components/create-form'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/activities/add')({
  component: function Page() {
    const { lng } = Route.useParams()
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
                { label: 'Add Rule', href: '/admin/activities/add' },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <AllowlistRuleCreateForm lng={lng} />
          </Container>
        </Section>
      </>
    )
  },
})

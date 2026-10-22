import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { LtiPlatformCreateForm } from '@/modules/admin/lti-platforms/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/lti-platforms/add')({
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
                { label: 'LTI Platforms', href: '/admin/lti-platforms' },
                { label: 'Add LTI Platform', href: '/admin/lti-platforms/add' },
              ]}
            />
          </Container>
        </Section>

        <Section>
          <Container>
            <LtiPlatformCreateForm lng={lng} />
          </Container>
        </Section>
      </>
    )
  },
})

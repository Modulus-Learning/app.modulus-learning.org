import { createFileRoute } from '@tanstack/react-router'

import { Card, Container, Section } from '@infonomic/uikit/react'

import { pageHead } from '@/lib/head'
import { CreateActivityCodeForm } from '@/modules/app/activities/components/create-activity-code-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_auth/dashboard/create-activity-code')({
  head: ({ matches }) =>
    pageHead({ title: 'Create Activity Code', path: '/dashboard/create-activity-code' }, matches),
  component: function CreateActivityCode() {
    const { lng } = Route.useParams()
    return (
      <>
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              lng={lng}
              breadcrumbs={[
                { label: 'Activity Codes', href: '/dashboard' },
                { label: 'Create Activity Code', href: '/dashboard/create-activity-code' },
              ]}
            />
          </Container>
        </Section>
        <Section>
          <Container className="sm:px-[32px] mb-8">
            <div className="max-w-[800px] mx-auto mt-[2vh]">
              <Card>
                <Card.Header>
                  <Card.Title>
                    <h1>Create Activity Code</h1>
                  </Card.Title>
                  <Card.Description>
                    Data will be collected on all activities under the same activity code.
                  </Card.Description>
                </Card.Header>
                <Card.Content>
                  <CreateActivityCodeForm lng={lng} />
                </Card.Content>
              </Card>
            </div>
          </Container>
        </Section>
      </>
    )
  },
})

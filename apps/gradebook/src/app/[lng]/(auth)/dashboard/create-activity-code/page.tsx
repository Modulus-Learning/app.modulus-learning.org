import { Card, Container, Section } from '@infonomic/uikit/react'

import { CreateActivityCodeForm } from '@/modules/app/activities/components/create-activity-code-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import type { Locale } from '@/i18n/i18n-config'

export default async function CreateActivityCode({
  params,
}: {
  params: Promise<{ lng: Locale }>
}): Promise<React.JSX.Element> {
  const { lng } = await params

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
                <Card.Title>Create Activity Code</Card.Title>
                <Card.Description>
                  Activity codes are similar to a course, module, or assignment name. Use the button
                  below to generate a new activity code.
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
}

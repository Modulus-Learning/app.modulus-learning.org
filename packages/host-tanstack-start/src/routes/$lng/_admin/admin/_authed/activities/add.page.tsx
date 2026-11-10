import { useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AllowlistRuleCreateForm } from '@/modules/admin/activity-url-allowlist/components/create-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { lng } = useParams({ strict: false })
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
}

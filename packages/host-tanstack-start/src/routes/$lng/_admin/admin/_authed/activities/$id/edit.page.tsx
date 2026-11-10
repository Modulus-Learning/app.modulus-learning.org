import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AllowlistRuleEditForm } from '@/modules/admin/activity-url-allowlist/components/edit-form'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { id, lng } = useParams({ strict: false })
  const { data } = useLoaderData({ strict: false })
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
}

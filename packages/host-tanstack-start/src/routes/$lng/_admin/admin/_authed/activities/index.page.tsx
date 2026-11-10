import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { AllowlistRulesListView } from '@/modules/admin/activity-url-allowlist/components/list-view'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

export const Page = function Page() {
  const { lng } = useParams({ strict: false })
  const { data } = useLoaderData({ strict: false })
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
}

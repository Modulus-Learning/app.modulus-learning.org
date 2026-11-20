import { useLoaderData, useParams } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { LtiPlatformEditForm } from '@/modules/admin/lti-platforms/components/edit-form'
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
            breadcrumbs={[
              { label: 'LTI Platforms', href: '/admin/lti-platforms' },
              { label: 'LTI Platform', href: `/admin/lti-platforms/${data?.platform.id}` },
              { label: 'Edit', href: `/admin/lti-platforms/${data?.platform.id}/edit` },
            ]}
          />
        </Container>
      </Section>

      <Section>
        <Container>
          <h1>{data?.platform.name}</h1>
          <LtiPlatformEditForm lng={lng} data={data} />
        </Container>
      </Section>
    </>
  )
}

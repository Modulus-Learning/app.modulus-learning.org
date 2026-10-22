import { createFileRoute } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { pageHead } from '@/lib/head'
import { DocsList } from '@/modules/docs/components/list'
import { listDocsFn } from '@/modules/docs/docs'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { GradientGlow } from '@/ui/components/gradient'

export const Route = createFileRoute('/$lng/_public/docs/')({
  loader: () => listDocsFn(),
  head: ({ matches }) => pageHead({ title: 'Docs', path: '/docs' }, matches),
  component: function DocsIndexPage() {
    const { lng } = Route.useParams()
    const docs = Route.useLoaderData()
    return (
      <>
        <GradientGlow />
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs lng={lng} breadcrumbs={[{ label: 'Docs', href: '/docs' }]} />
          </Container>
        </Section>
        <Section className="py-6">
          <Container>
            <h1 className="mb-6 text-3xl font-bold tracking-tight">Docs</h1>
            {docs.length === 0 ? <p>No docs published yet.</p> : <DocsList docs={docs} lng={lng} />}
          </Container>
        </Section>
      </>
    )
  },
})

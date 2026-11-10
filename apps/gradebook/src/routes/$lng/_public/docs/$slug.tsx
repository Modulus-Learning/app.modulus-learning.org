import { useMemo } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'
import { GradientGlow } from '@modulus-learning/host-tanstack-start/ui/components/gradient'

import { getDocFn } from '@/modules/docs/docs'
import { renderMarkdownSync } from '@/modules/docs/lib/render'

export const Route = createFileRoute('/$lng/_public/docs/$slug')({
  loader: async ({ params }) => {
    const doc = await getDocFn({ data: params.slug })
    if (doc == null) throw notFound()
    return doc
  },
  head: ({ matches, loaderData }) =>
    pageHead(
      loaderData != null
        ? {
            title: loaderData.summary.frontmatter.title,
            description: loaderData.summary.frontmatter.summary,
            path: `/docs/${loaderData.summary.slug}`,
          }
        : {},
      matches
    ),
  component: function DocPage() {
    const { lng } = Route.useParams()
    const { summary, body } = Route.useLoaderData()
    const { title } = summary.frontmatter
    const content = useMemo(() => renderMarkdownSync(body, title), [body, title])
    return (
      <>
        <GradientGlow />
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              lng={lng}
              breadcrumbs={[
                { label: 'Docs', href: '/docs' },
                { label: title, href: `/docs/${summary.slug}` },
              ]}
            />
          </Container>
        </Section>
        <Section className="py-6">
          <Container>
            <article className="prose">
              <h1>{title}</h1>
              {content}
            </article>
          </Container>
        </Section>
      </>
    )
  },
})

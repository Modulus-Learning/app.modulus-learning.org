import { useMemo } from 'react'
import { notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import type { Locale } from '@modulus-learning/host-tanstack-start/i18n/i18n-config'
import { pageHead } from '@modulus-learning/host-tanstack-start/lib/head'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'
import { GradientGlow } from '@modulus-learning/host-tanstack-start/ui/components/gradient'

import { renderMarkdownSync } from './lib/render'
import { getPageFn } from './pages'
import type { Page } from './pages.server'

/** Route options shared by every standalone markdown page: load by slug, set the head. */
export function markdownPageRoute(slug: string) {
  return {
    loader: async () => {
      const page = await getPageFn({ data: slug })
      if (page == null) throw notFound()
      return page
    },
    head: ({
      matches,
      loaderData,
    }: {
      matches: Parameters<typeof pageHead>[1]
      loaderData?: Page
    }) =>
      pageHead(
        loaderData != null
          ? {
              title: loaderData.frontmatter.title,
              description: loaderData.frontmatter.summary,
              path: `/${loaderData.slug}`,
            }
          : {},
        matches
      ),
  }
}

export function MarkdownPage({ lng, page }: { lng: Locale; page: Page }) {
  const { title } = page.frontmatter
  const content = useMemo(() => renderMarkdownSync(page.body, title), [page.body, title])
  return (
    <>
      <GradientGlow />
      <Section className="py-5 pb-2">
        <Container>
          <Breadcrumbs lng={lng} breadcrumbs={[{ label: title, href: `/${page.slug}` }]} />
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
}

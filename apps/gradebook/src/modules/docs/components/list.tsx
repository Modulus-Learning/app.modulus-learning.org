import type React from 'react'

import { Card, ChevronRightIcon } from '@infonomic/uikit/react'
import { LangLink } from '@modulus-learning/host-tanstack-start/framework/index'
import type { Locale } from '@modulus-learning/host-tanstack-start/i18n/i18n-config'

import type { DocEntry } from '@/modules/docs/lib/registry'

interface DocsListProps {
  docs: DocEntry[]
  lng: Locale
}

export function DocsList({ docs, lng }: DocsListProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {docs.map((doc) => (
        <DocCard key={doc.slug} doc={doc} lng={lng} />
      ))}
    </div>
  )
}

interface DocCardProps {
  doc: DocEntry
  lng: Locale
}

function DocCard({ doc, lng }: DocCardProps): React.JSX.Element {
  const title = doc.frontmatter.title
  const summary = doc.frontmatter.summary?.trim()

  return (
    <Card
      hover
      className="flex h-full flex-col no-underline"
      render={<LangLink href={`/docs/${doc.slug}`} lng={lng} aria-label={`Read ${title}`} />}
    >
      <Card.Header>
        <Card.Title>
          <h2 className="m-0 line-clamp-2 text-2xl font-semibold tracking-tight">{title}</h2>
        </Card.Title>
      </Card.Header>
      <Card.Content className="flex-1">
        {summary ? (
          <p className="m-0 line-clamp-4 text-base leading-relaxed text-[var(--muted,inherit)]">
            {summary}
          </p>
        ) : (
          <p className="m-0 text-base italic opacity-70">No summary available.</p>
        )}
      </Card.Content>
      <Card.Footer>
        <span className="inline-flex items-center gap-1 text-sm font-semibold">
          Read more
          <ChevronRightIcon width="16px" height="16px" aria-hidden="true" />
        </span>
      </Card.Footer>
    </Card>
  )
}

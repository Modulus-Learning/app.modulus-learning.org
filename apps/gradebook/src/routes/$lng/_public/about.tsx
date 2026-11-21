import { createFileRoute } from '@tanstack/react-router'

import { MarkdownPage, markdownPageRoute } from '@/modules/pages/markdown-page'

// Content: src/content/pages/about.md
export const Route = createFileRoute('/$lng/_public/about')({
  ...markdownPageRoute('about'),
  component: function Page() {
    const { lng } = Route.useParams()
    return <MarkdownPage lng={lng} page={Route.useLoaderData()} />
  },
})

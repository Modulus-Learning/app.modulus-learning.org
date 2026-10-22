import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { pageHead } from '@/lib/head'
import { validateSearchParamsSchema } from '@/modules/app/activities/@types'
import { LearnersProgressView } from '@/modules/app/activities/components/learners-progress-view'
import { getProgress } from '@/modules/app/activities/get-progress'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'

type LearnersSearch = {
  page?: string
  desc?: string
  order?: string
  query?: string
  role?: string
}

export const Route = createFileRoute('/$lng/_auth/dashboard/activity-code/$id/learners')({
  // Search values stay strings, as the Next page received them; the shared
  // schema decides validity and an invalid query is a 404, as before.
  validateSearch: (search: Record<string, unknown>): LearnersSearch =>
    Object.fromEntries(
      Object.entries(search)
        .filter(([key]) => ['page', 'desc', 'order', 'query', 'role'].includes(key))
        .map(([key, value]) => [key, String(value)])
    ),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    if (!validateSearchParamsSchema.safeParse(deps).success) throw notFound()
    return getProgress(params.id, deps)
  },
  head: ({ matches, params }) =>
    pageHead(
      { title: 'Learners', path: `/dashboard/activity-code/${params.id}/learners` },
      matches
    ),
  component: function LearnersPage() {
    const { lng, id } = Route.useParams()
    const data = Route.useLoaderData()
    return (
      <>
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              lng={lng}
              breadcrumbs={[
                { label: 'Activity Codes', href: '/dashboard' },
                { label: 'Activity Code', href: `/dashboard/activity-code/${id}` },
                { label: 'Learners', href: `/dashboard/activity-code/${id}/learners` },
              ]}
            />
          </Container>
        </Section>
        <LearnersProgressView data={data} lng={lng} />
      </>
    )
  },
})

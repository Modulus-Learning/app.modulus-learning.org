import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'

import { validateSearchParamsSchema } from '@/modules/admin/users/@types'
import { UsersListView } from '@/modules/admin/users/components/list-view'
import { listUsers } from '@/modules/admin/users/list'
import { Breadcrumbs } from '@/ui/components/breadcrumbs'
import { FlashToast } from '@/ui/components/flash-toast'

const rootRoute = getRouteApi('__root__')

export const Route = createFileRoute('/$lng/_admin/admin/_authed/users/')({
  // Search values stay strings, as the Next page received them; the page's own
  // schema decides validity (an invalid query is a 404, as before).
  validateSearch: (search: Record<string, unknown>): Record<string, string> =>
    Object.fromEntries(Object.entries(search).map(([key, value]) => [key, String(value)])),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const { lng } = params

    const validateResult = validateSearchParamsSchema.safeParse(deps)
    if (!validateResult.success) {
      throw notFound()
    }

    const data = await listUsers(lng, validateResult.data)
    return { data }
  },
  component: function Page() {
    const { lng } = Route.useParams()
    const { data } = Route.useLoaderData()
    const flashMessage = rootRoute.useLoaderData().flash
    return (
      <>
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              homeLabel="Admin"
              homePath="/admin"
              lng={lng}
              breadcrumbs={[{ label: 'Users', href: '/admin/users' }]}
            />
          </Container>
        </Section>
        <UsersListView lng={lng} data={data} />
        <FlashToast message={flashMessage} />
      </>
    )
  },
})

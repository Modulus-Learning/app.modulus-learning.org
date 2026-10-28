import { createFileRoute, notFound } from '@tanstack/react-router'

import { Container, Section } from '@infonomic/uikit/react'
import { validateSearchParamsSchema } from '@modulus-learning/host-tanstack-start/modules/admin/admin-users/@types/index'
import { AdminUsersListView } from '@modulus-learning/host-tanstack-start/modules/admin/admin-users/components/list-view'
import { listAdminUsers } from '@modulus-learning/host-tanstack-start/modules/admin/admin-users/list'
import { Breadcrumbs } from '@modulus-learning/host-tanstack-start/ui/components/breadcrumbs'

export const Route = createFileRoute('/$lng/_admin/admin/_authed/admin-users/')({
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

    const data = await listAdminUsers(lng, validateResult.data)
    return { data }
  },
  component: function Page() {
    const { lng } = Route.useParams()
    const { data } = Route.useLoaderData()
    return (
      <>
        <Section className="py-5 pb-2">
          <Container>
            <Breadcrumbs
              homeLabel="Admin"
              homePath="/admin"
              lng={lng}
              breadcrumbs={[{ label: 'Admin Users', href: '/admin/admin-users' }]}
            />
          </Container>
        </Section>
        <AdminUsersListView lng={lng} data={data} />
      </>
    )
  },
})

import { createFileRoute } from '@tanstack/react-router'

// Lists an activity code's activities for the deep-linking picker. Requires a
// verified learner session (the instructor's).
export const Route = createFileRoute('/routes/lti/deep-link/activities')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getCoreCommands, getCoreUserRequestContext } = await import(
          '@modulus-learning/host-tanstack-start/lib/core/start-adapter'
        )
        const userAuth = await getCoreUserRequestContext()
        if (userAuth == null) {
          return Response.json({ status: 'failed', message: 'Not authenticated' }, { status: 401 })
        }

        const id = new URL(request.url).searchParams.get('id')
        if (!id) {
          return Response.json({ status: 'failed', message: 'Missing id' }, { status: 400 })
        }

        const core = await getCoreCommands()
        const result = await core.app.activities.getActivitiesByActivityCodeId(userAuth, id)
        if (!result.ok) {
          return Response.json(
            { status: 'failed', message: 'Error fetching activities' },
            { status: 500 }
          )
        }
        return Response.json({ status: 'success', activities: result.data.activities })
      },
    },
  },
})

export const handlers = {
  POST: async ({ request }: { request: Request }) =>
    (await import('@/modules/lti/handlers/launch.server')).handleLtiLaunch(request),
}

export const handlers = {
  POST: async ({ request }: { request: Request }) =>
    (await import('@/modules/lti/handlers/login.server')).handleLtiLogin(request),
}

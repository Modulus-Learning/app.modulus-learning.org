export const handlers = {
  GET: async ({ request }: { request: Request }) =>
    (await import('@/modules/app/session/oauth-callback.server')).handleGoogleCallback(request),
}

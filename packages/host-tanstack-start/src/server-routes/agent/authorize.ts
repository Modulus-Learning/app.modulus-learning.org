export const handlers = {
  GET: async ({ request }: { request: Request }) =>
    (await import('@/modules/agent/handlers/authorize.server')).handleAgentAuthorize(request),
}

export const handlers = {
  POST: async ({ request }: { request: Request }) =>
    (await import('@/modules/agent/handlers/token.server')).handleAgentToken(request),
}

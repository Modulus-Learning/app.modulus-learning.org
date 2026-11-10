export const handlers = {
  OPTIONS: async () => {
    const { AGENT_ACTIVITY_CORS } = await import('@/modules/agent/handlers/activity.server')
    return new Response(null, { status: 200, headers: AGENT_ACTIVITY_CORS })
  },
  POST: async ({ request }: { request: Request }) =>
    (await import('@/modules/agent/handlers/activity.server')).handleAgentActivity(request),
}

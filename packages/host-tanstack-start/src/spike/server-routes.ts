// Server-route handlers for host route files. The host's literal
// `createFileRoute(path)({ server: { handlers } })` lets Start strip the
// handlers, and with them this module, from the client build.
export const spikeStatusHandlers = {
  GET: async () => {
    const { greet } = await import('./greeting.server.js')
    return Response.json({ status: 'okay', greeting: greet('status') })
  },
}

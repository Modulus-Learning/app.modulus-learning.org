// The tool's public JSON Web Key Set, used by LTI platforms to verify the
// messages and client assertions the tool signs.
export const handlers = {
  GET: async () => {
    const { getCoreCommands, getCoreRequestContext } = await import('@/lib/core/start-adapter')
    const core = await getCoreCommands()
    const result = await core.app.lti.getJWKS(getCoreRequestContext())
    if (result.ok) {
      return Response.json(result.data)
    }
    return Response.json({ message: 'Internal error' }, { status: 500 })
  },
}

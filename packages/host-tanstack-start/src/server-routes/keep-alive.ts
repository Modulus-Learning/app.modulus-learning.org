// Ported as-is from the Next handler, which pings a Vercel deployment URL. It
// is a legacy leftover (VERCEL_URL is not set on Fly) and is recorded as such
// in the contract suite; its future is undecided, so behaviour is unchanged.
export const handlers = {
  GET: async () => {
    await fetch(`https://${process.env.VERCEL_URL}/admin`)
    return Response.json({ okay: true })
  },
}

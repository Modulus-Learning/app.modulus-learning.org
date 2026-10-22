/**
 * TanStack Start server-side stand-in for `next/navigation`, used only while
 * bridged Next server actions run on Start (see `@/lib/action-bridge`). The
 * Vite `nextShims` plugin maps `next/navigation` here in the server build; the
 * client build never resolves it. Removed in Task 18 with the bridge.
 */
export class ShimRedirect extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`)
  }
}

export class ShimNotFound extends Error {
  constructor() {
    super('not found')
  }
}

export const redirect = (url: string): never => {
  throw new ShimRedirect(url)
}

export const permanentRedirect = redirect

export const notFound = (): never => {
  throw new ShimNotFound()
}

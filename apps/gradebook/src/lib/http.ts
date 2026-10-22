/**
 * Response helpers for TanStack Start server-route handlers. Redirects carry an
 * absolute `Location` resolved against the request, as `NextResponse.redirect`
 * did, so the two hosts emit the same header.
 */

export const redirectTo = (request: Request, destination: string, status: 303 | 307 = 307) =>
  new Response(null, {
    status,
    headers: { Location: new URL(destination, request.url).href },
  })

/** 303 See Other: the browser follows with a GET, so a POST body is never replayed onward. */
export const seeOther = (request: Request, destination: string) =>
  redirectTo(request, destination, 303)

export const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init)

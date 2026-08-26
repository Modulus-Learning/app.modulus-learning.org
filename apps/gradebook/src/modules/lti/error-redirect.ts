import { type NextRequest, NextResponse } from 'next/server'

import type { LtiErrorSlug } from './error-slug'

/**
 * Sends a failed LTI request to the readable error page.
 *
 * Both LTI routes are POST handlers, and the status code is load-bearing.
 * `redirect()` from `next/navigation` emits 307 Temporary Redirect, which
 * preserves the method -- the browser would POST to `/lti/error`, a page that
 * only answers GET, and the learner would get a 405 instead of the readable
 * page this exists to give them. 303 See Other is the status that turns the
 * POST into a GET of the error page.
 */
export const ltiErrorRedirect = (request: NextRequest, slug: LtiErrorSlug): NextResponse =>
  NextResponse.redirect(new URL(`/lti/error?code=${slug}`, request.url), 303)

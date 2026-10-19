import { type NextRequest, NextResponse } from 'next/server'

import type { LtiErrorSlug } from './error-slug'

/**
 * Redirects a browser away from an LTI route with **303 See Other**.
 *
 * The status is load-bearing, and it is set explicitly rather than left to the
 * framework. Both LTI routes are POST handlers: the platform delivers the login
 * request and the authentication response as auto-submitting HTML forms. A 307
 * would preserve the method and body, so the browser would re-POST them to
 * wherever we send it -- for a launch redirected straight to the activity, that
 * means POSTing the learner's `id_token` and `state` to a third-party content
 * origin, which the no-PII boundary forbids. 303 turns the hop into a GET.
 *
 * `redirect()` from `next/navigation` cannot be relied on for this. It records
 * 307, and Next downgrades it to 303 only when it classifies the request as a
 * "possible server action" -- a judgement made purely from the POST's
 * content-type, for reasons that have nothing to do with this route. Today
 * every launch satisfies that test, so the emitted status is correct by
 * accident of two unrelated mechanisms lining up. This states it instead.
 *
 * `destination` may be relative (a Modulus page) or absolute (an activity URL).
 */
export const ltiSeeOther = (request: NextRequest, destination: string): NextResponse =>
  NextResponse.redirect(new URL(destination, request.url), 303)

/** Sends a failed LTI request to the readable error page. See `ltiSeeOther`. */
export const ltiErrorRedirect = (request: NextRequest, slug: LtiErrorSlug): NextResponse =>
  ltiSeeOther(request, `/lti/error?code=${slug}`)

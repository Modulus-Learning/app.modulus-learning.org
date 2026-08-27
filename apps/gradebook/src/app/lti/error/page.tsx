import type React from 'react'

import type { LtiErrorSlug } from '@/modules/lti/error-slug'

/**
 * The closed set of learner-facing launch failures. The slug chooses what the
 * learner should do next, never what went wrong internally: no member carries
 * diagnostics, and the raw query value is never reflected into the DOM.
 * Diagnostic detail stays in the `log.error({ lti_launch: ... })` and
 * `log.error({ lti_login: ... })` calls in the routes that redirect here.
 */
const MESSAGES: Record<LtiErrorSlug, { title: string; message: string }> = {
  invalid_request: {
    title: 'Launch Error',
    message: 'The launch request was not valid. Please return to your LMS and try again.',
  },
  invalid_launch: {
    title: 'Launch Error',
    message: 'This activity could not be launched. Please contact your instructor.',
  },
  // Reached when the `state-<state>` cookie is missing. That cookie is set
  // `SameSite=None`, so the likeliest cause in practice is a launch rendered
  // inside a Canvas iframe with third-party cookies blocked -- the instructor
  // did not tick "open in a new tab". Detecting and reporting the framed case
  // is deliberately out of scope; this is not a generic fallback.
  session_expired: {
    title: 'Launch Incomplete',
    message:
      'Your launch could not be completed. Please return to your LMS and open the activity again.',
  },
  server_error: {
    title: 'Something Went Wrong',
    message:
      'Something went wrong on our end. This is not a problem with your course link. Please try again shortly.',
  },
}

/**
 * `server_error` is the default for an unknown or absent slug as well as for
 * every core error code the allowlist in `error-slug.ts` does not name, so an
 * outage never tells the learner to contact their instructor.
 */
const resolveSlug = (code: string | string[] | undefined): LtiErrorSlug =>
  typeof code === 'string' && Object.hasOwn(MESSAGES, code)
    ? (code as LtiErrorSlug)
    : 'server_error'

export default async function LtiErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>
}): Promise<React.JSX.Element> {
  const { code } = await searchParams
  const { title, message } = MESSAGES[resolveSlug(code)]

  return (
    <div className="flex justify-center mt-[12vh] sm:mt-[18vh] bg-gray-50 not-dark">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow border">
        <h1 className="text-xl font-semibold mb-4">{title}</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  )
}

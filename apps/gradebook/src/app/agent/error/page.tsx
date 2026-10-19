import type React from 'react'

import type { AgentErrorSlug } from '@/modules/agent/error-slug'

/**
 * The dead end for an agent authorization request whose `redirect_uri` has no
 * safe interpretation.
 *
 * The slug chooses what the learner should do next, never what went wrong
 * internally: no member carries diagnostics, and **no caller-supplied value is
 * ever reflected into this page**. The value that brought a learner here is by
 * definition one that failed validation — rendering it, or putting it in a
 * link, would turn a rejected URI into page content. The diagnosis belongs in
 * the server log of the route that redirected here.
 *
 * Not rendering it is necessary but not sufficient. Next serializes the request
 * URL, query string included, into the RSC flight payload of the served HTML,
 * so a value placed in `?code=` reaches the response whatever this page does.
 * A caller must therefore redirect here with a fixed slug and never with the
 * rejected URI.
 */
const MESSAGES: Record<AgentErrorSlug, { title: string; message: string }> = {
  invalid_request: {
    title: 'Launch Error',
    message:
      'This activity could not be connected to Modulus. Your work on this page will not be recorded. Please contact your instructor.',
  },
  server_error: {
    title: 'Something Went Wrong',
    message:
      'Something went wrong on our end. This is not a problem with your course link. Please try again shortly.',
  },
}

/**
 * `server_error` is the default for an unknown or absent slug, so an outage
 * never tells the learner their activity is at fault.
 */
const resolveSlug = (code: string | string[] | undefined): AgentErrorSlug =>
  typeof code === 'string' && Object.hasOwn(MESSAGES, code)
    ? (code as AgentErrorSlug)
    : 'server_error'

/**
 * Answers `200`. This is an App Router page reached by a redirect, not an error
 * response — the failure has already been reported to the caller by the route
 * that sent the learner here.
 */
export default async function AgentErrorPage({
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

/**
 * Reads the rejected activity URLs out of a core error report.
 *
 * `ErrorReport.details` is `Record<string, unknown>`, so nothing about its
 * shape is checked at the boundary. Core builds this payload through one
 * constructor (`activityUrlNotAllowed`), but the host still has to narrow it
 * defensively rather than assert it: a mismatch should degrade to the generic
 * failure message, never throw inside a server action.
 *
 * The order is core's, not the instructor's -- the registration loop sorts the
 * submitted URLs before evaluating them, so these come back sorted rather than
 * in the order the lines appeared in the form.
 */
export function readRejectedUrls(details: Record<string, unknown> | undefined): string[] {
  if (details == null || !Array.isArray(details.rejected)) {
    return []
  }

  return details.rejected
    .map((entry) =>
      entry != null && typeof entry === 'object' && 'url' in entry
        ? (entry as { url: unknown }).url
        : undefined
    )
    .filter((url): url is string => typeof url === 'string' && url !== '')
}

/**
 * The instructor-facing sentence for a denied submission.
 *
 * It echoes the URLs the instructor submitted and nothing else. It must never
 * disclose the allowlist, the currently approved base URLs, the identity of an
 * administrator, or any rule the instructor did not write. That is a resolved
 * decision, not a UI preference: an instructor is not authorized to read site
 * trust policy, and a denial is not a reason to show it to them.
 */
export function rejectedUrlsMessage(urls: string[]): string {
  return `This Modulus site does not allow these activity URLs: ${urls.join(', ')}. Contact a Modulus administrator to request access.`
}

/**
 * Activity URL identity, instructor-input validation, and the per-code prefix
 * comparison, as pure functions over strings.
 *
 * A canonical activity URL is the WHATWG `URL` serialization of the input,
 * parsed without a base, with query and fragment removed. Nothing else is
 * rewritten: path case, non-root trailing slashes, repeated slashes, host
 * aliases, trailing host dots, and percent-escape spelling all remain
 * significant, because merging two activities that are actually different
 * would combine learner progress and page state.
 *
 * Like `url-policy.ts`, this module is deliberately dependency-free — no
 * logger, database, service, registry, or framework imports — so the gradebook
 * can import it for form feedback and the whole contract can be tested without
 * a database.
 *
 * Parsing is not admission. None of these helpers checks scheme, credentials,
 * the 255-character bound on `activities.url`, or the allowlist; an unseen
 * activity still has to pass `parseAdmissibleUrl()` and the policy during
 * registration. Credentials are never stripped to make a URL usable.
 */

/** The outcome of validating one instructor-supplied activity URL or prefix. */
export type InstructorActivityUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'malformed_url' | 'unsupported_url_components' }

/** Parses without a base, returning `null` rather than throwing. */
const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * Removes query and fragment from a freshly parsed `URL` and serializes it.
 * Assigning `''` clears each component entirely, so an empty `?` or `#` does
 * not survive into the result.
 */
const serializeWithoutComponents = (url: URL): string => {
  url.search = ''
  url.hash = ''
  return url.href
}

/**
 * Returns the canonical activity URL for `value`, or `null` if the platform
 * parser rejects it.
 *
 * `HTTPS://CONTENT.TEST:443/lesson?x=1#top` becomes
 * `https://content.test/lesson`. The result is idempotent: normalizing a
 * canonical URL returns it unchanged.
 */
export const normalizeActivityUrl = (value: string): string | null => {
  const url = parseUrl(value)
  return url === null ? null : serializeWithoutComponents(url)
}

/**
 * Validates an instructor-supplied activity URL: it must parse, and it must
 * carry no query or fragment — not even an empty one from a trailing `?` or
 * `#`. On success, returns the canonical string.
 *
 * Presence is detected in the serialization **before** the components are
 * cleared. Checking `url.search` or `url.hash` would miss an empty component,
 * because both read as `''`. A literal `?` or `#` in the serialization can only
 * be a delimiter: the parser starts a query or fragment at them in a path, and
 * percent-encodes or rejects them elsewhere. An encoded `%3F` or `%23` in a
 * path is therefore an ordinary path character and is accepted.
 */
export const validateInstructorActivityUrl = (value: string): InstructorActivityUrlResult => {
  const url = parseUrl(value)
  if (url === null) {
    return { ok: false, reason: 'malformed_url' }
  }

  if (url.href.includes('?') || url.href.includes('#')) {
    return { ok: false, reason: 'unsupported_url_components' }
  }

  return { ok: true, url: serializeWithoutComponents(url) }
}

/**
 * Whether the activity URL `value` falls under an activity code's `prefix`.
 *
 * Both sides are validated as instructor input and canonicalized, then compared
 * with a plain string `startsWith()`. That keeps the existing per-code prefix
 * semantics — `https://content.test/course` matches `/coursework`, while an
 * authored trailing slash in `https://content.test/course/` does not — while
 * letting spelling variants such as an uppercase host or an explicit default
 * port match. An origin-only prefix gains its root `/` on both sides.
 *
 * Returns `false` if either side is invalid; callers that need to say which
 * field is wrong validate separately. An empty prefix is invalid here, so a
 * caller treating an empty prefix as "no constraint" must check for it first.
 * This is not the allowlist rule matcher: `normalizeRuleBaseUrl()` strips
 * trailing slashes and matches at path-segment boundaries.
 */
export const matchesActivityUrlPrefix = (value: string, prefix: string): boolean => {
  const candidate = validateInstructorActivityUrl(value)
  const base = validateInstructorActivityUrl(prefix)
  return candidate.ok && base.ok && candidate.url.startsWith(base.url)
}

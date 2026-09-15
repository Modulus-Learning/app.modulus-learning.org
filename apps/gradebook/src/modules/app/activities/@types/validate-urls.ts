import {
  matchesActivityUrlPrefix,
  validateInstructorActivityUrl,
} from '@modulus-learning/core/activity-url'

/**
 * Instructor activity URL and URL prefix feedback, shared by the activity-code
 * forms, their server actions, and the deep-link form.
 *
 * This is parse and component validation plus the per-code prefix comparison,
 * all through core's pure helpers so the host and core agree on what a URL is.
 * It is deliberately **not** an admission check: scheme, credentials, and the
 * sitewide allowlist only apply to activities Modulus has not seen, and only
 * core can tell whether an activity is already registered. A parseable
 * `http://` or credentialed URL therefore passes here and is refused, or
 * resolved as a grandfathered activity, by core.
 *
 * No message echoes a submitted value.
 */

/** The `activities.url` and `activity_codes.url_prefix` column width. */
const MAX_URL_PREFIX_LENGTH = 255

export const ACTIVITY_URL_MESSAGES = {
  malformed_url: 'Supply a valid absolute activity URL.',
  unsupported_url_components:
    'Activity URLs cannot include query strings or fragments. Supply the activity URL without these components; Modulus does not currently support custom launch parameters.',
  multiple_urls: 'Enter one activity URL per line.',
  prefix_mismatch: 'Activity URLs must start with the URL prefix.',
  required: 'Select or enter an activity URL.',
} as const

export const URL_PREFIX_MESSAGES = {
  malformed_url: 'Supply a valid absolute URL prefix.',
  unsupported_url_components:
    'URL prefixes cannot include query strings or fragments. Supply the URL prefix without these components; Modulus does not currently support custom launch parameters.',
  url_too_long: 'The canonical URL prefix must be 255 characters or fewer.',
} as const

export const DEEP_LINK_PREFIX_MESSAGES = {
  mismatch: 'Supply an activity URL matching the configured prefix.',
  invalid: "Correct this activity code's URL prefix before creating the link.",
} as const

/** A message attributed to a physical, 1-based textarea line. */
export interface LineMessage {
  line: number
  message: string
}

/**
 * The activity URLs a textarea submits, with the physical line each came from.
 *
 * `urls` is exactly the array sent to core, so `lineNumbers[i]` is the line an
 * instructor sees for `urls[i]` -- blank lines are skipped but still counted,
 * and a spelling repeated on several lines keeps an entry per line.
 */
export interface SubmittedUrlLines {
  urls: string[]
  lineNumbers: number[]
}

export function readUrlLines(text: string | null | undefined): SubmittedUrlLines {
  const urls: string[] = []
  const lineNumbers: number[] = []

  // Browsers submit textarea newlines as CRLF; trimming removes the `\r`.
  const lines = (text ?? '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const url = lines[i].trim()
    if (url !== '') {
      urls.push(url)
      lineNumbers.push(i + 1)
    }
  }

  return { urls, lineNumbers }
}

/**
 * Joins line-attributed messages into one field message, in physical line
 * order, with lines that share a message listed together:
 * `Lines 2, 5: <message> Line 3: <message>`.
 */
export function formatLineMessages(entries: LineMessage[]): string {
  const byMessage = new Map<string, number[]>()
  for (const { line, message } of [...entries].sort((a, b) => a.line - b.line)) {
    const lines = byMessage.get(message)
    if (lines === undefined) {
      byMessage.set(message, [line])
    } else if (!lines.includes(line)) {
      lines.push(line)
    }
  }

  return [...byMessage].map(([message, lines]) => `${lineLabel(lines)}: ${message}`).join(' ')
}

export function lineLabel(lines: number[]): string {
  return lines.length === 1 ? `Line ${lines[0]}` : `Lines ${lines.join(', ')}`
}

/**
 * Validates an optional activity-code URL prefix. Empty means no constraint.
 *
 * Length is measured on the canonical form, as core measures it: an explicit
 * default port can shrink a prefix into range, and punycode can grow one out.
 */
export function validateUrlPrefix(value: string | null | undefined): {
  valid: boolean
  message: string
} {
  const normalizedValue = value?.trim() ?? ''
  if (normalizedValue === '') {
    return { valid: true, message: '' }
  }

  const result = validateInstructorActivityUrl(normalizedValue)
  if (!result.ok) {
    return { valid: false, message: URL_PREFIX_MESSAGES[result.reason] }
  }

  if (result.url.length > MAX_URL_PREFIX_LENGTH) {
    return { valid: false, message: URL_PREFIX_MESSAGES.url_too_long }
  }

  return { valid: true, message: '' }
}

/**
 * Validates the physical lines of an activity URL textarea.
 *
 * Pass the lines **before** removing blank ones, so every message names the
 * line the instructor sees. Blank lines are allowed. Every invalid line is
 * reported, not just the first.
 *
 * The prefix comparison is core's canonical `startsWith()`, so
 * `HTTPS://Content.test:443/course/x` falls under `https://content.test/course`.
 * An invalid prefix is reported against its own field by
 * {@link validateUrlPrefix}; it is not repeated against every line here.
 */
export function validateUrls(
  lines: string[] | null,
  urlPrefix?: string | null
): { valid: boolean; message: string } {
  if (lines == null || lines.length === 0) {
    return { valid: false, message: 'No URLs provided.' } // Allow empty or null input
  }

  const normalizedPrefix = urlPrefix?.trim() ?? ''
  const applyPrefix = normalizedPrefix !== '' && validateUrlPrefix(normalizedPrefix).valid

  const issues: LineMessage[] = []
  for (let i = 0; i < lines.length; i++) {
    const message = lineMessage(lines[i].trim(), applyPrefix ? normalizedPrefix : null)
    if (message != null) {
      issues.push({ line: i + 1, message })
    }
  }

  return issues.length === 0
    ? { valid: true, message: '' }
    : { valid: false, message: formatLineMessages(issues) }
}

function lineMessage(line: string, prefix: string | null): string | null {
  if (line === '') return null // Allow empty lines

  // The parser would percent-encode an inner space into the path and accept
  // two URLs pasted onto one line as a single activity.
  if (/\s/.test(line)) {
    return ACTIVITY_URL_MESSAGES.multiple_urls
  }

  const result = validateInstructorActivityUrl(line)
  if (!result.ok) {
    return ACTIVITY_URL_MESSAGES[result.reason]
  }

  if (prefix != null && !matchesActivityUrlPrefix(line, prefix)) {
    return ACTIVITY_URL_MESSAGES.prefix_mismatch
  }

  return null
}

/**
 * Validates a deep-link activity URL against the selected code's stored prefix.
 *
 * Mirrors core's deep-link checks and their field attribution: a prefix that is
 * itself invalid is a problem with the activity code, never with the entered
 * URL, and is not silently treated as no constraint. As in core, only a
 * `null` or empty stored prefix means no constraint.
 */
export function validateDeepLinkActivityUrl(
  value: string,
  urlPrefix: string | null | undefined
): { activity_url?: string; activity_code_id?: string } {
  const errors: { activity_url?: string; activity_code_id?: string } = {}

  const trimmedValue = value.trim()
  const url = trimmedValue === '' ? null : validateInstructorActivityUrl(trimmedValue)
  if (url == null) {
    errors.activity_url = ACTIVITY_URL_MESSAGES.required
  } else if (!url.ok) {
    errors.activity_url = ACTIVITY_URL_MESSAGES[url.reason]
  }

  if (urlPrefix != null && urlPrefix.length > 0) {
    if (!validateInstructorActivityUrl(urlPrefix).ok) {
      errors.activity_code_id = DEEP_LINK_PREFIX_MESSAGES.invalid
    } else if (url?.ok === true && !matchesActivityUrlPrefix(trimmedValue, urlPrefix)) {
      errors.activity_url = DEEP_LINK_PREFIX_MESSAGES.mismatch
    }
  }

  return errors
}

import { formatLineMessages, lineLabel } from './@types/validate-urls'
import type { LineMessage, SubmittedUrlLines } from './@types/validate-urls'

/**
 * Decoding of the activity URL failures core reports to instructor actions:
 * registration denials (`ERR_ACTIVITY_URL_NOT_ALLOWED`) and command validation
 * issues (`ERR_VALIDATION`).
 *
 * `ErrorReport.details` is `Record<string, unknown>`, so nothing about its
 * shape is checked at the boundary. Core builds each payload through one
 * constructor, but the host still has to narrow it defensively rather than
 * assert it: a mismatch should degrade to a neutral failure message, never
 * throw inside a server action.
 */

/** The registration denial reasons this host knows how to explain. */
export const REGISTRATION_DENIAL_REASONS = [
  'activity_url_not_allowed',
  'malformed_url',
  'url_too_long',
] as const

export type RegistrationDenialReason = (typeof REGISTRATION_DENIAL_REASONS)[number]

/**
 * One denied submission. `reason` is `null` when core sent no reason, or one
 * this host does not recognize: the URL is still kept so the instructor can be
 * pointed at the line, but no admission reason is guessed.
 */
export interface RejectedUrl {
  url: string
  reason: RegistrationDenialReason | null
}

const isDenialReason = (value: unknown): value is RegistrationDenialReason =>
  typeof value === 'string' && (REGISTRATION_DENIAL_REASONS as readonly string[]).includes(value)

/**
 * Reads the rejected activity URLs out of an `ERR_ACTIVITY_URL_NOT_ALLOWED`
 * report, each with its reason. Entries without a usable `url` are dropped; an
 * empty result means the payload is unusable.
 *
 * The order is core's, not the instructor's. Core registers canonical keys in
 * sorted order and expands each denied key back to the spellings submitted for
 * it, so this is neither physical line order nor raw lexicographic order.
 * {@link rejectedUrlsMessage} restores line order from the submission.
 */
export function readRejectedUrls(details: Record<string, unknown> | undefined): RejectedUrl[] {
  if (details == null || !Array.isArray(details.rejected)) {
    return []
  }

  const rejected: RejectedUrl[] = []
  for (const entry of details.rejected as unknown[]) {
    if (entry == null || typeof entry !== 'object') continue
    const { url, reason } = entry as { url?: unknown; reason?: unknown }
    if (typeof url !== 'string' || url === '') continue
    rejected.push({ url, reason: isDenialReason(reason) ? reason : null })
  }

  return rejected
}

/**
 * The correction for each denial reason. Only a policy denial sends the
 * instructor to an administrator: approval cannot fix a malformed or
 * overlong URL, and a neutral fallback must not claim that it would.
 */
const guidance = (reason: RegistrationDenialReason | null, count: number): string => {
  const plural = count !== 1
  switch (reason) {
    case 'activity_url_not_allowed':
      return plural
        ? 'This Modulus site does not admit these new activity URLs. Contact a Modulus administrator to request access.'
        : 'This Modulus site does not admit this new activity URL. Contact a Modulus administrator to request access.'
    case 'malformed_url':
      return `Correct ${plural ? 'these URLs' : 'this URL'}: new activities require HTTPS, or HTTP for localhost or 127.0.0.1, and cannot contain credentials.`
    case 'url_too_long':
      return `The canonical activity URL${plural ? 's exceed' : ' exceeds'} the 255-character storage limit. Supply a shorter activity URL.`
    default:
      return `Modulus could not register ${plural ? 'these activity URLs' : 'this activity URL'}.`
  }
}

/**
 * The instructor-facing text for a denied submission, with guidance chosen per
 * reason.
 *
 * Given the submission's line mapping, each reason group names every physical
 * line holding a denied spelling, groups appear in the order of their first
 * line, and URLs are listed in line order. Without it -- the single deep-link
 * field -- the URLs are listed as core sent them.
 *
 * It echoes the URLs the instructor submitted and nothing else. It must never
 * disclose the allowlist, the currently approved base URLs, the identity of an
 * administrator, or any rule the instructor did not write. That is a resolved
 * decision, not a UI preference: an instructor is not authorized to read site
 * trust policy, and a denial is not a reason to show it to them.
 */
export function rejectedUrlsMessage(
  rejected: RejectedUrl[],
  submitted?: SubmittedUrlLines
): string {
  type Occurrence = { url: string; line: number | null }
  const groups = new Map<RegistrationDenialReason | null, Occurrence[]>()

  for (const { url, reason } of rejected) {
    const lines =
      submitted?.urls.flatMap((candidate, i) =>
        candidate === url ? [submitted.lineNumbers[i]] : []
      ) ?? []

    const occurrences = groups.get(reason) ?? []
    groups.set(reason, occurrences)
    if (lines.length === 0) {
      occurrences.push({ url, line: null })
    } else {
      for (const line of lines) occurrences.push({ url, line })
    }
  }

  // Unmatched URLs cannot happen when core echoes the submission, but sort
  // after every located line rather than being lost.
  const position = (line: number | null) => line ?? Number.POSITIVE_INFINITY

  return [...groups]
    .map(([reason, occurrences]) => {
      const ordered = [...occurrences].sort((a, b) => position(a.line) - position(b.line))
      const urls = [...new Set(ordered.map((o) => o.url))]
      const lines = [...new Set(ordered.flatMap((o) => (o.line == null ? [] : [o.line])))]
      const label = lines.length > 0 ? `${lineLabel(lines)}: ` : ''
      return {
        first: position(ordered[0]?.line ?? null),
        text: `${label}${urls.join(', ')}. ${guidance(reason, urls.length)}`,
      }
    })
    .sort((a, b) => a.first - b.first)
    .map(({ text }) => text)
    .join(' ')
}

/** A command validation issue, narrowed to what the host reads. */
export interface ValidationIssue {
  path: (string | number)[]
  message: string
}

/**
 * Reads the Zod issues out of an `ERR_VALIDATION` report. Core's instructor
 * URL messages are fixed strings that never echo the submitted value, so they
 * are safe to show as field warnings.
 */
export function readValidationIssues(
  details: Record<string, unknown> | undefined
): ValidationIssue[] {
  if (details == null || !Array.isArray(details.issues)) {
    return []
  }

  const issues: ValidationIssue[] = []
  for (const entry of details.issues as unknown[]) {
    if (entry == null || typeof entry !== 'object') continue
    const { path, message } = entry as { path?: unknown; message?: unknown }
    if (typeof message !== 'string' || !Array.isArray(path)) continue
    if (!path.every((part) => typeof part === 'string' || typeof part === 'number')) continue
    issues.push({ path: path as (string | number)[], message })
  }

  return issues
}

/** The part of a core `ErrorReport` these mappings read. */
interface CoreFailure {
  code: string
  details?: Record<string, unknown>
}

export type ActivityCodeFailure =
  | {
      type: 'fields'
      errors: { urls?: string[]; url_prefix?: string[] }
      message: string
    }
  /** A denial whose payload names no URL: show a neutral failure. */
  | { type: 'unreadable-denial' }

/**
 * Maps a failed create or update command onto the activity-code form fields.
 *
 * Returns `null` for anything that is not about the URL fields, which the
 * action handles on its generic, logged path. Both field outcomes return
 * ahead of that log deliberately: `details` carries whole submitted URLs,
 * query and fragment included, and an instructor's input is not an error.
 *
 * `ERR_VALIDATION` normally never reaches core from these forms -- the action
 * applies the same parse and component checks first -- but when it does, its
 * `urls[index]` paths are translated to physical lines so the warning names
 * the line the instructor sees.
 */
export function mapActivityCodeFailure(
  error: CoreFailure,
  submitted: SubmittedUrlLines
): ActivityCodeFailure | null {
  if (error.code === 'ERR_ACTIVITY_URL_NOT_ALLOWED') {
    const rejected = readRejectedUrls(error.details)
    if (rejected.length === 0) {
      return { type: 'unreadable-denial' }
    }
    return {
      type: 'fields',
      errors: { urls: [rejectedUrlsMessage(rejected, submitted)] },
      message: 'Some activity URLs could not be registered.',
    }
  }

  if (error.code === 'ERR_VALIDATION') {
    const urlLines: LineMessage[] = []
    const unlocatedUrlMessages: string[] = []
    const prefixMessages: string[] = []

    for (const { path, message } of readValidationIssues(error.details)) {
      if (path[0] === 'url_prefix') {
        if (!prefixMessages.includes(message)) prefixMessages.push(message)
      } else if (path[0] === 'urls') {
        const index = path[1]
        const line = typeof index === 'number' ? submitted.lineNumbers[index] : undefined
        if (line === undefined) {
          if (!unlocatedUrlMessages.includes(message)) unlocatedUrlMessages.push(message)
        } else {
          urlLines.push({ line, message })
        }
      }
    }

    const urlText = [formatLineMessages(urlLines), ...unlocatedUrlMessages]
      .filter((text) => text !== '')
      .join(' ')

    if (urlText === '' && prefixMessages.length === 0) {
      return null
    }

    return {
      type: 'fields',
      errors: {
        ...(urlText === '' ? {} : { urls: [urlText] }),
        ...(prefixMessages.length === 0 ? {} : { url_prefix: [prefixMessages.join(' ')] }),
      },
      message: urlText === '' ? 'Invalid URL prefix.' : 'Invalid URLs.',
    }
  }

  return null
}

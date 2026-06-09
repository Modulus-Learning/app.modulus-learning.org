/**
 * Classifier for error responses from Canvas LMS's AGS score-submission
 * endpoint (POST /api/lti/courses/:course_id/line_items/:line_item_id/scores).
 *
 * Categories:
 *   platform      — the developer key / registration itself is broken; every
 *                   AGS submission against this key will keep failing until
 *                   fixed at the platform level (token signing, scopes,
 *                   key activation, etc.).
 *   deployment    — a deployment install or its account-chain binding is the
 *                   problem; *probe sibling deployments / sibling sub-accounts
 *                   before deciding how broadly to pause*, because a context
 *                   control can make this error as narrow as one course.
 *   lineitem_dead — the specific line item, course, user, or assignment is
 *                   the problem; the key and deployment are otherwise healthy.
 *                   Don't attempt to resubmit this line-item.
 *   malformed     — the request is structurally wrong; almost always a coding
 *                   bug in the tool. Do not retry until the tool is fixed.
 *   other         — transient (5xx, gateway, rate-limit), stale-write, or an
 *                   unrecognized response; usually safe to retry with backoff.
 *
 * The Response body is read via response.clone(), so callers can still read
 * the original Response themselves.
 */

import type { SubmissionErrorCategory, SubmissionResult } from './types.js'

interface Rule {
  status: number
  match?: (message: string) => boolean
  category: SubmissionErrorCategory
  description: string
}

const has =
  (...needles: string[]) =>
  (msg: string): boolean => {
    const lower = msg.toLowerCase()
    return needles.some((n) => lower.includes(n.toLowerCase()))
  }

// Order matters: more-specific message matchers must come before generic
// ones for the same status code (e.g. "Invalid access token signature"
// before the catch-all "Invalid access token").
const RULES: Rule[] = [
  // ---------- 401 (auth / authorization) ----------
  {
    status: 401,
    match: has('Missing access token'),
    category: 'malformed',
    description: 'no access token sent on request',
  },
  {
    status: 401,
    match: has('Invalid access token format'),
    category: 'platform_token',
    description: 'access token is not a well-formed JWT',
  },
  {
    status: 401,
    match: has('Invalid access token signature'),
    category: 'platform_token',
    description: 'JWT signature did not verify against the registered JWKs',
  },
  {
    status: 401,
    match: has('Access token signature algorithm not allowed'),
    category: 'platform_token',
    description: 'JWT signing algorithm not permitted by Canvas',
  },
  {
    status: 401,
    match: has('Access token contains invalid claims'),
    category: 'platform_token',
    description: 'JWT claims rejected (audience, expiry, iss, sub, etc.)',
  },
  {
    status: 401,
    match: has('Expired access token'),
    category: 'platform_token',
    description: 'access token expired; obtain a fresh token and retry',
  },
  {
    status: 401,
    match: has('Revoked access token'),
    category: 'platform_token',
    description: 'access token has been revoked',
  },
  {
    status: 401,
    match: has('Insufficient scopes on access token'),
    category: 'platform_token',
    description: 'access token does not carry the AGS score scope',
  },
  {
    status: 401,
    match: has('Insufficient permissions'),
    category: 'platform_config',
    description: 'developer key is not registered with the AGS score scope',
  },
  {
    status: 401,
    match: has('Unknown or inactive Developer Key'),
    category: 'platform_token',
    description: 'developer key is missing, deleted, or inactive',
  },
  {
    status: 401,
    match: has('Invalid Developer Key'),
    category: 'lineitem_dead',
    description:
      "developer key not enabled in this course's account chain, or registration deactivated",
  },
  {
    status: 401,
    match: has('Access Token not linked to a Tool associated with this Context'),
    category: 'lineitem_dead',
    description: 'no active deployment of this key reachable from this course',
  },
  {
    status: 401,
    match: has('Invalid access token'),
    category: 'platform_token',
    description: 'access token rejected by Canvas',
  },

  // ---------- 403 (rate limit / blocklist) ----------
  {
    status: 403,
    category: 'rate_limit',
    description: 'rate-limit bucket exhausted or operator-blocked; backoff and retry',
  },

  // ---------- 404 (context / resource gone) ----------
  {
    status: 404,
    match: has('Context is deleted or not found'),
    category: 'lineitem_dead',
    description: 'course context missing or deleted',
  },
  {
    status: 404,
    match: has('The specified resource does not exist'),
    category: 'lineitem_dead',
    description: 'line item, assignment, or course not found',
  },
  {
    status: 404,
    category: 'lineitem_dead',
    description: 'resource not found',
  },

  // ---------- 412 (precondition) ----------
  {
    status: 412,
    match: has('The specified LTI link ID is not associated with the line item'),
    category: 'malformed',
    description: 'resourceLinkId does not match the line item',
  },
  {
    status: 412,
    match: has('Tool does not have permission to view line_item'),
    category: 'lineitem_dead',
    description: 'line item not associated with developer key',
  },
  {
    status: 412,
    category: 'malformed',
    description: 'precondition failed',
  },

  // ---------- 413 (payload) ----------
  {
    status: 413,
    category: 'malformed',
    description: 'request payload too large',
  },

  // ---------- 400 (validation / bad request) ----------
  {
    status: 400,
    match: has('is missing'),
    category: 'malformed',
    description: 'required parameter missing',
  },
  {
    status: 400,
    match: has('before last updated timestamp'),
    category: 'superseded',
    description: 'stale timestamp — Canvas already has a newer score for this line item',
  },
  {
    status: 400,
    match: has('in the future'),
    category: 'malformed',
    description: 'submitted_at is more than a minute in the future',
  },
  {
    status: 400,
    match: has('not a valid timestamp'),
    category: 'malformed',
    description: 'timestamp could not be parsed',
  },
  {
    status: 400,
    match: has('uploading to file service failed'),
    category: 'malformed',
    description: 'Canvas file service rejected the upload as a bad request',
  },
  {
    status: 400,
    category: 'malformed',
    description: 'bad request',
  },

  // ---------- 422 (unprocessable entity) ----------
  {
    status: 422,
    match: has('This course has concluded'),
    category: 'lineitem_dead',
    description: 'course concluded (for this student or globally)',
  },
  {
    status: 422,
    match: has('User not found in course or is not a student'),
    category: 'lineitem_dead',
    description: 'user is not (or no longer) a student in this course',
  },
  {
    status: 422,
    match: has('This assignment is still unpublished'),
    category: 'lineitem_dead',
    description: 'assignment is unpublished',
  },
  {
    status: 422,
    match: has('Resource link id points to Tool not associated with this Context'),
    category: 'lineitem_dead',
    description: 'resourceLinkId points to a tool that no longer matches this context',
  },
  {
    status: 422,
    match: has('cannot be zero if line item'),
    category: 'malformed',
    description: "scoreMaximum is zero but the line item's max is not",
  },
  {
    status: 422,
    match: has('ScoreMaximum'),
    category: 'malformed',
    description: 'invalid scoreMaximum (missing or negative)',
  },
  {
    status: 422,
    match: has('ScoreGiven must be greater than or equal to 0'),
    category: 'malformed',
    description: 'scoreGiven is negative',
  },
  {
    status: 422,
    match: has("Content items must be provided with submission type 'online_upload'"),
    category: 'malformed',
    description: 'online_upload submission type requires content_items',
  },
  {
    status: 422,
    match: has('maximum number of allowed attempts has been reached'),
    category: 'lineitem_dead',
    description: 'user has no submission attempts remaining',
  },
  {
    status: 422,
    match: has('Student must be enrolled in the course as a student'),
    category: 'lineitem_dead',
    description: "user's enrollment does not allow grading",
  },
  {
    status: 422,
    match: has('Cannot grade this submission at this time'),
    category: 'lineitem_dead',
    description: 'submission not gradeable (e.g. moderated grading state)',
  },
  {
    status: 422,
    match: has('Must provide a valid sub assignment tag'),
    category: 'lineitem_dead',
    description: 'checkpointed discussion sub-assignment cannot accept AGS scores',
  },
  {
    status: 422,
    category: 'unknown',
    description: 'unprocessable entity (uncategorized validation or grading error)',
  },
]

// function parseBody(text: string): unknown {
//   try {
//     return JSON.parse(text)
//   } catch {
//     return text
//   }
// }

// function extractMessage(body: unknown): string {
//   if (body == null) return ''
//   if (typeof body === 'string') return body
//   if (typeof body !== 'object') return ''

//   const errors = (body as Record<string, unknown>).errors
//   if (errors == null) return ''

//   // Shape A: { errors: { type, message } }
//   if (!Array.isArray(errors) && typeof errors === 'object') {
//     const e = errors as Record<string, unknown>
//     if (typeof e.message === 'string') return e.message

//     // Shape C: { errors: { field: [{ message }] } }
//     for (const key of Object.keys(e)) {
//       const val = e[key]
//       if (Array.isArray(val) && val.length > 0) {
//         const first = val[0] as Record<string, unknown> | undefined
//         if (first && typeof first.message === 'string') {
//           return `${key}: ${first.message}`
//         }
//       }
//     }
//   }

//   // Shape B: { errors: [{ message }] }
//   if (Array.isArray(errors) && errors.length > 0) {
//     const first = errors[0] as Record<string, unknown> | undefined
//     if (first && typeof first.message === 'string') return first.message
//   }

//   return ''
// }

export async function classifyScoreSubmissionResponse(
  status: number,
  getText: () => Promise<string>
): Promise<SubmissionResult> {
  if (status >= 200 && status < 300) {
    return {
      ok: true,
    }
  }

  const text = await getText()

  if (status >= 500) {
    return {
      ok: false,
      category: 'transient',
      description: 'server error',
      status,
      text,
    }
  }

  for (const rule of RULES) {
    if (rule.status === status && rule.match?.(text)) {
      return {
        ok: false,
        category: rule.category,
        description: rule.description,
        status,
        text,
      }
    }
  }

  return {
    ok: false,
    category: 'unknown',
    description: 'unrecognized error',
    status,
    text,
  }
}

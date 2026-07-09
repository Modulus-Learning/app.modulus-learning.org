import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classifyScoreSubmissionResponse } from './error-classifier.js'
import type { SubmissionErrorCategory } from './types.js'

const classify = (status: number, body = '') =>
  classifyScoreSubmissionResponse(status, async () => body)

// One case per rule in RULES (same order), plus the per-status catch-alls and
// fall-throughs. `body` is a realistic Canvas message containing the rule's
// needle; matching is substring-based over the raw response text.
const CASES: { status: number; body: string; expected: SubmissionErrorCategory; name?: string }[] =
  [
    // ---------- 401 ----------
    { status: 401, body: 'Missing access token', expected: 'malformed' },
    { status: 401, body: 'Invalid access token format', expected: 'platform_token' },
    { status: 401, body: 'Invalid access token signature', expected: 'platform_token' },
    {
      status: 401,
      body: 'Access token signature algorithm not allowed',
      expected: 'platform_token',
    },
    { status: 401, body: 'Access token contains invalid claims', expected: 'platform_token' },
    { status: 401, body: 'Expired access token', expected: 'platform_token' },
    { status: 401, body: 'Revoked access token', expected: 'platform_token' },
    { status: 401, body: 'Insufficient scopes on access token', expected: 'platform_token' },
    { status: 401, body: 'Insufficient permissions', expected: 'platform_config' },
    { status: 401, body: 'Unknown or inactive Developer Key', expected: 'platform_token' },
    { status: 401, body: 'Invalid Developer Key', expected: 'lineitem_dead' },
    {
      status: 401,
      body: 'Access Token not linked to a Tool associated with this Context',
      expected: 'lineitem_dead',
    },
    { status: 401, body: 'Invalid access token', expected: 'platform_token' },
    {
      status: 401,
      body: 'some new 401 body we have never seen',
      expected: 'unknown',
      name: '401 with an unrecognized message falls through (no 401 catch-all)',
    },

    // ---------- 403 ----------
    {
      status: 403,
      body: '403 Forbidden (Rate Limit Exceeded)',
      expected: 'rate_limit',
      name: '403 catch-all is rate_limit regardless of body',
    },
    { status: 403, body: '', expected: 'rate_limit', name: '403 with an empty body is rate_limit' },

    // ---------- 404 ----------
    { status: 404, body: 'Context is deleted or not found', expected: 'lineitem_dead' },
    { status: 404, body: 'The specified resource does not exist.', expected: 'lineitem_dead' },
    {
      status: 404,
      body: '<html>route not recognized</html>',
      expected: 'lineitem_dead',
      name: '404 catch-all is lineitem_dead',
    },

    // ---------- 412 ----------
    {
      status: 412,
      body: 'The specified LTI link ID is not associated with the line item.',
      expected: 'malformed',
    },
    {
      status: 412,
      body: 'Tool does not have permission to view line_item',
      expected: 'lineitem_dead',
    },
    { status: 412, body: 'some other precondition', expected: 'malformed', name: '412 catch-all' },

    // ---------- 413 ----------
    { status: 413, body: 'payload too big', expected: 'malformed', name: '413 catch-all' },

    // ---------- 400 ----------
    { status: 400, body: 'The parameter userId is missing', expected: 'malformed' },
    {
      status: 400,
      body: 'Provided timestamp of 2026-01-01 before last updated timestamp of 2026-01-02',
      expected: 'superseded',
    },
    { status: 400, body: 'timestamp is more than one minute in the future', expected: 'malformed' },
    { status: 400, body: 'timestamp is not a valid timestamp', expected: 'malformed' },
    { status: 400, body: 'uploading to file service failed', expected: 'malformed' },
    { status: 400, body: 'anything else', expected: 'malformed', name: '400 catch-all' },

    // ---------- 422 ----------
    { status: 422, body: 'This course has concluded', expected: 'lineitem_dead' },
    {
      status: 422,
      body: 'User not found in course or is not a student',
      expected: 'lineitem_dead',
    },
    { status: 422, body: 'This assignment is still unpublished', expected: 'lineitem_dead' },
    {
      status: 422,
      body: 'Resource link id points to Tool not associated with this Context',
      expected: 'lineitem_dead',
    },
    {
      status: 422,
      body: 'ScoreMaximum cannot be zero if line item score_maximum is greater than zero',
      expected: 'malformed',
    },
    { status: 422, body: 'ScoreMaximum must be present and greater than 0', expected: 'malformed' },
    { status: 422, body: 'ScoreGiven must be greater than or equal to 0', expected: 'malformed' },
    {
      status: 422,
      body: "Content items must be provided with submission type 'online_upload'",
      expected: 'malformed',
    },
    {
      status: 422,
      body: 'The maximum number of allowed attempts has been reached for this submission',
      expected: 'lineitem_dead',
    },
    {
      status: 422,
      body: 'Student must be enrolled in the course as a student to be graded',
      expected: 'lineitem_dead',
    },
    { status: 422, body: 'Cannot grade this submission at this time', expected: 'lineitem_dead' },
    { status: 422, body: 'Must provide a valid sub assignment tag', expected: 'lineitem_dead' },
    {
      status: 422,
      body: 'a validation error we have no rule for',
      expected: 'unknown',
      name: '422 catch-all is unknown',
    },

    // ---------- unmatched statuses fall through ----------
    { status: 418, body: 'I am a teapot', expected: 'unknown', name: 'unlisted 4xx is unknown' },
  ]

describe('classifyScoreSubmissionResponse', () => {
  it('treats any 2xx as success without reading the body', async () => {
    let bodyRead = false
    const result = await classifyScoreSubmissionResponse(200, async () => {
      bodyRead = true
      return ''
    })
    assert.deepEqual(result, { ok: true })
    assert.equal(bodyRead, false, 'success must not consume the body')

    assert.deepEqual(await classify(204), { ok: true })
  })

  it('classifies any 5xx as transient', async () => {
    for (const status of [500, 502, 503, 504]) {
      const result = await classify(status, 'gateway detail')
      assert.equal(result.ok, false)
      assert.equal(result.ok === false && result.category, 'transient', `status ${status}`)
    }
  })

  for (const { status, body, expected, name } of CASES) {
    it(name ?? `${status} "${body.slice(0, 60)}" → ${expected}`, async () => {
      const result = await classify(status, body)
      assert.equal(result.ok, false)
      if (result.ok === false) {
        assert.equal(result.category, expected)
        assert.equal(result.status, status, 'carries the HTTP status')
        assert.equal(result.text, body, 'carries the raw body for diagnostics')
      }
    })
  }

  it('matches case-insensitively', async () => {
    const result = await classify(422, 'THIS COURSE HAS CONCLUDED')
    assert.equal(result.ok === false && result.category, 'lineitem_dead')
  })

  it('matches needles inside a JSON error body', async () => {
    const body = JSON.stringify({
      errors: [{ message: 'This course has concluded for this student.' }],
    })
    const result = await classify(422, body)
    assert.equal(result.ok === false && result.category, 'lineitem_dead')
  })

  it('prefers the specific rule over the generic one for the same status', async () => {
    // 'Invalid access token signature' contains 'Invalid access token';
    // rule order must make the specific (signature) rule win. Both are
    // platform_token, so distinguish by description.
    const result = await classify(401, 'Invalid access token signature')
    assert.equal(
      result.ok === false && result.description,
      'JWT signature did not verify against the registered JWKs'
    )
  })

  // Every category the classifier can emit is exercised above; this pins the
  // full set so a new category can't ship without a test touching it.
  it('covers every SubmissionErrorCategory', () => {
    const covered = new Set<string>(CASES.map((c) => c.expected))
    covered.add('transient') // 5xx test above
    const all: SubmissionErrorCategory[] = [
      'superseded',
      'lineitem_dead',
      'transient',
      'platform_config',
      'platform_token',
      'rate_limit',
      'malformed',
      'unknown',
    ]
    for (const category of all) {
      assert.ok(covered.has(category), `no test case emits '${category}'`)
    }
  })
})

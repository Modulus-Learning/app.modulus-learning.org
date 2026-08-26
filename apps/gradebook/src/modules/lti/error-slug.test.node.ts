import { describe, expect, test } from 'vitest'

import { errorSlugFor } from './error-slug'

describe('errorSlugFor', () => {
  test.each(['ERR_INVALID_LOGIN', 'ERR_INVALID_LAUNCH'])(
    'classifies the domain code %s as a bad launch',
    (code) => {
      expect(errorSlugFor(code)).toBe('invalid_launch')
    }
  )

  test('classifies a failed input schema as a malformed request', () => {
    expect(errorSlugFor('ERR_VALIDATION')).toBe('invalid_request')
  })

  test.each([
    'ERR_UNHANDLED',
    'ERR_DATABASE',
    // Token signing runs on every launch, and a command whose response fails
    // its own output schema is an internal fault -- neither is the learner's
    // problem, so neither may reach `invalid_launch`.
    'ERR_JWT_ENCODE',
    'ERR_OUTPUT_VALIDATION',
  ])('classifies the internal code %s as our fault', (code) => {
    expect(errorSlugFor(code)).toBe('server_error')
  })

  // The allowlist direction: an unrecognised code must default to
  // `server_error`, so a code added to core tomorrow cannot silently start
  // telling learners to contact their instructor. Asserted against a code that
  // does not exist anywhere, so a denylist could not satisfy this test.
  test('defaults an unrecognised code to our fault rather than the learner’s', () => {
    expect(errorSlugFor('ERR_INVENTED_TOMORROW')).toBe('server_error')
    expect(errorSlugFor('')).toBe('server_error')
  })
})

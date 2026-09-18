import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { v7 as uuidv7 } from 'uuid'
import type { z } from 'zod'

import { normalizeActivityUrl } from '@/modules/activity-registration/activity-url.js'
import {
  createActivityCodeRequestSchema,
  INSTRUCTOR_ACTIVITY_URL_MESSAGES,
  URL_PREFIX_MESSAGES,
  updateActivityCodeRequestSchema,
} from './schemas.js'

/**
 * Create and update share every URL and prefix rule, so each case below runs
 * against both. `base` supplies each schema's other required fields.
 */
const requestSchemas = [
  { name: 'create', schema: createActivityCodeRequestSchema, base: { code: 'brave-otter' } },
  { name: 'update', schema: updateActivityCodeRequestSchema, base: { id: uuidv7() } },
] as const

const ORIGIN = 'https://content.test'

/** The single issue a failed parse produced, with its path and message. */
const onlyIssue = (result: z.ZodSafeParseResult<unknown>) => {
  assert.equal(result.success, false)
  assert.equal(result.error?.issues.length, 1)
  const [issue] = result.error?.issues ?? []
  return { path: issue?.path, message: issue?.message }
}

/** Asserts a precondition on the raw and canonical lengths of a test input. */
const withLengths = (
  value: string,
  raw: (n: number) => boolean,
  canonical: (n: number) => boolean
) => {
  const key = normalizeActivityUrl(value)
  assert.ok(key !== null, 'test input must parse')
  assert.ok(raw(value.length), `raw length ${value.length} does not meet the precondition`)
  assert.ok(canonical(key.length), `canonical length ${key.length} does not meet the precondition`)
  return value
}

for (const { name, schema, base } of requestSchemas) {
  describe(`${name} activity code request: urls`, () => {
    it('retains the submitted spelling of every accepted url', () => {
      const urls = [
        'HTTPS://CONTENT.TEST:443/lesson',
        `${ORIGIN}/unit/../lesson`,
        `${ORIGIN}/a%3Fb%23c`,
        `${ORIGIN}/lesson`,
      ]

      const result = schema.safeParse({ ...base, urls })

      assert.equal(result.success, true)
      assert.deepEqual(result.data?.urls, urls)
    })

    it('accepts encoded query and fragment delimiters as path characters', () => {
      const result = schema.safeParse({ ...base, urls: [`${ORIGIN}/what%3F`, `${ORIGIN}/%23top`] })
      assert.equal(result.success, true)
    })

    for (const url of [
      `${ORIGIN}/lesson?exercise=1`,
      `${ORIGIN}/lesson#part-2`,
      `${ORIGIN}/lesson?`,
      `${ORIGIN}/lesson#`,
      `${ORIGIN}/lesson?#`,
    ]) {
      it(`rejects ${url} at its index with the component warning`, () => {
        const result = schema.safeParse({ ...base, urls: [`${ORIGIN}/fine`, url] })

        assert.deepEqual(onlyIssue(result), {
          path: ['urls', 1],
          message: INSTRUCTOR_ACTIVITY_URL_MESSAGES.unsupported_url_components,
        })
      })
    }

    for (const url of [
      `${ORIGIN}/lesson one`,
      `  ${ORIGIN}/lesson one  `,
      `${ORIGIN}/one ${ORIGIN}/two`,
      // The space warning takes precedence over the component warning.
      `${ORIGIN}/lesson one?x=1`,
      `${ORIGIN}/lesson one#top`,
    ]) {
      it(`rejects ${JSON.stringify(url)} at its index with the literal-space warning`, () => {
        const result = schema.safeParse({ ...base, urls: [`${ORIGIN}/fine`, url] })

        assert.deepEqual(onlyIssue(result), {
          path: ['urls', 1],
          message: INSTRUCTOR_ACTIVITY_URL_MESSAGES.literal_space,
        })
      })
    }

    it('accepts an encoded space and surrounding whitespace, retaining the spelling', () => {
      const urls = [`${ORIGIN}/lesson%20one`, ` ${ORIGIN}/lesson `]

      const result = schema.safeParse({ ...base, urls })

      assert.equal(result.success, true)
      assert.deepEqual(result.data?.urls, urls)
    })

    it('rejects an unparseable url at its index', () => {
      const result = schema.safeParse({ ...base, urls: ['not-a-url'] })

      assert.deepEqual(onlyIssue(result), {
        path: ['urls', 0],
        message: INSTRUCTOR_ACTIVITY_URL_MESSAGES.malformed_url,
      })
    })

    it('leaves scheme, credential, and length admission to registration', () => {
      // Parseable but inadmissible for an unseen activity. Rejecting these here
      // would also block a grandfathered activity with the same spelling.
      const urls = [
        'http://content.test/plain-http',
        'https://user:secret@content.test/credentialed',
        `${ORIGIN}/${'a'.repeat(300)}`,
      ]

      const result = schema.safeParse({ ...base, urls })

      assert.equal(result.success, true)
      assert.deepEqual(result.data?.urls, urls)
    })

    it('keeps submitted values out of the issues it reports', () => {
      const result = schema.safeParse({
        ...base,
        urls: [`${ORIGIN}/lesson?token=secret-token-value#secret-fragment`],
      })

      const serialized = JSON.stringify(result.error?.issues)
      assert.doesNotMatch(serialized, /secret-token-value/)
      assert.doesNotMatch(serialized, /secret-fragment/)
      assert.doesNotMatch(serialized, /content\.test/)
    })

    it('accepts an empty url list', () => {
      const result = schema.safeParse({ ...base, urls: [] })
      assert.equal(result.success, true)
    })
  })

  describe(`${name} activity code request: url_prefix`, () => {
    it('treats an empty prefix as no constraint', () => {
      const result = schema.safeParse({ ...base, url_prefix: '', urls: [] })

      assert.equal(result.success, true)
      assert.equal(result.data?.url_prefix, null)
    })

    it('treats a whitespace-only prefix as no constraint', () => {
      for (const url_prefix of [' ', '   ', '\t\n']) {
        const result = schema.safeParse({ ...base, url_prefix, urls: [] })

        assert.equal(result.success, true, JSON.stringify(url_prefix))
        assert.equal(result.data?.url_prefix, null, JSON.stringify(url_prefix))
      }
    })

    it('accepts an explicit null prefix', () => {
      const result = schema.safeParse({ ...base, url_prefix: null, urls: [] })

      assert.equal(result.success, true)
      assert.equal(result.data?.url_prefix, null)
    })

    it('accepts an omitted prefix', () => {
      const result = schema.safeParse({ ...base, urls: [] })

      assert.equal(result.success, true)
      assert.equal(result.data?.url_prefix, undefined)
    })

    for (const [input, expected] of [
      ['HTTPS://CONTENT.TEST:443', `${ORIGIN}/`],
      ['https://Content.Test/course/', `${ORIGIN}/course/`],
      [`${ORIGIN}/unit/../course`, `${ORIGIN}/course`],
      [`${ORIGIN}/course%3F`, `${ORIGIN}/course%3F`],
      [`${ORIGIN}/course%20one/`, `${ORIGIN}/course%20one/`],
      [`  ${ORIGIN}/course/  `, `${ORIGIN}/course/`],
    ] as const) {
      it(`outputs ${expected} for ${input}`, () => {
        const result = schema.safeParse({ ...base, url_prefix: input, urls: [] })

        assert.equal(result.success, true)
        assert.equal(result.data?.url_prefix, expected)
      })
    }

    it('canonicalizes the prefix while urls keep their submitted spellings', () => {
      const result = schema.safeParse({
        ...base,
        url_prefix: 'HTTPS://CONTENT.TEST:443/course',
        urls: ['HTTPS://CONTENT.TEST:443/course/one'],
      })

      assert.equal(result.success, true)
      assert.equal(result.data?.url_prefix, `${ORIGIN}/course`)
      assert.deepEqual(result.data?.urls, ['HTTPS://CONTENT.TEST:443/course/one'])
    })

    for (const prefix of [
      `${ORIGIN}/course?x=1`,
      `${ORIGIN}/course#top`,
      `${ORIGIN}/course?`,
      `${ORIGIN}/course#`,
    ]) {
      it(`rejects ${prefix} before removing its components`, () => {
        // Clearing first would silently accept `…/course?` as `…/course`.
        const result = schema.safeParse({ ...base, url_prefix: prefix, urls: [] })

        assert.deepEqual(onlyIssue(result), {
          path: ['url_prefix'],
          message: URL_PREFIX_MESSAGES.unsupported_url_components,
        })
      })
    }

    for (const prefix of [
      `${ORIGIN}/course one/`,
      ` ${ORIGIN}/course one/ `,
      `${ORIGIN}/course one?x=1`,
      `${ORIGIN}/course one#`,
    ]) {
      it(`rejects ${JSON.stringify(prefix)} with the prefix literal-space warning`, () => {
        const result = schema.safeParse({ ...base, url_prefix: prefix, urls: [] })

        assert.deepEqual(onlyIssue(result), {
          path: ['url_prefix'],
          message: URL_PREFIX_MESSAGES.literal_space,
        })
      })
    }

    it('rejects an unparseable prefix', () => {
      const result = schema.safeParse({ ...base, url_prefix: 'content.test/course', urls: [] })

      assert.deepEqual(onlyIssue(result), {
        path: ['url_prefix'],
        message: URL_PREFIX_MESSAGES.malformed_url,
      })
    })

    describe('canonical length', () => {
      const tooLong = { path: ['url_prefix'], message: URL_PREFIX_MESSAGES.url_too_long }

      it('accepts a canonical prefix of exactly 255 characters', () => {
        const prefix = withLengths(
          `${ORIGIN}/${'a'.repeat(234)}`,
          (n) => n === 255,
          (n) => n === 255
        )

        const result = schema.safeParse({ ...base, url_prefix: prefix, urls: [] })

        assert.equal(result.success, true)
        assert.equal(result.data?.url_prefix?.length, 255)
      })

      it('rejects a canonical prefix of 256 characters', () => {
        const prefix = withLengths(
          `${ORIGIN}/${'a'.repeat(235)}`,
          (n) => n === 256,
          (n) => n === 256
        )

        assert.deepEqual(
          onlyIssue(schema.safeParse({ ...base, url_prefix: prefix, urls: [] })),
          tooLong
        )
      })

      it('rejects a short raw prefix that path percent-encoding grows past the bound', () => {
        const prefix = withLengths(
          `${ORIGIN}/${'é'.repeat(40)}`,
          (n) => n <= 255,
          (n) => n > 255
        )

        assert.deepEqual(
          onlyIssue(schema.safeParse({ ...base, url_prefix: prefix, urls: [] })),
          tooLong
        )
      })

      it('rejects a short raw prefix that punycode grows past the bound', () => {
        // Varied characters: punycode compresses a repeated one too well.
        const label = 'üöäéèêàçñå'.repeat(2)
        const prefix = withLengths(
          `https://${Array.from({ length: 9 }, () => label).join('.')}.test/`,
          (n) => n <= 255,
          (n) => n > 255
        )

        assert.deepEqual(
          onlyIssue(schema.safeParse({ ...base, url_prefix: prefix, urls: [] })),
          tooLong
        )
      })

      it('accepts a long raw prefix that canonicalizes within the bound', () => {
        const prefix = withLengths(
          `HTTPS://CONTENT.TEST:443/${'./'.repeat(150)}course`,
          (n) => n > 255,
          (n) => n <= 255
        )

        const result = schema.safeParse({ ...base, url_prefix: prefix, urls: [] })

        assert.equal(result.success, true)
        assert.equal(result.data?.url_prefix, `${ORIGIN}/course`)
      })
    })
  })
}

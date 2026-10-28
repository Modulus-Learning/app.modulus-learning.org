import { describe, expect, test } from 'vitest'

import { extractActivityLaunchParameters } from './launch-url'

describe('extractActivityLaunchParameters', () => {
  test('reconstructs the encoded route parameters delivered by App Router', () => {
    expect(
      extractActivityLaunchParameters([
        'surviving-ocelot',
        'https%3A',
        'activity.infonomic.local%3A5173',
        'calculus-1',
        'lesson-01',
      ])
    ).toEqual({
      activityCode: 'surviving-ocelot',
      destinationURL: 'https://activity.infonomic.local:5173/calculus-1/lesson-01',
    })
  })

  test.each([
    {
      segments: ['course-code', 'https:', 'content.test', 'activity'],
      expected: 'https://content.test/activity',
    },
    {
      segments: ['course-code', 'http%3A', '', 'localhost%3A5173', 'activity'],
      expected: 'http://localhost:5173/activity',
    },
  ])('accepts normalized and unnormalized slash shapes', ({ segments, expected }) => {
    expect(extractActivityLaunchParameters(segments)).toEqual({
      activityCode: 'course-code',
      destinationURL: expected,
    })
  })

  test('does not decode authored path escapes', () => {
    expect(
      extractActivityLaunchParameters([
        'course-code',
        'https%3A',
        'content.test%3A8443',
        'a%20b',
        'literal%25',
        'chapter%3A1',
      ])
    ).toEqual({
      activityCode: 'course-code',
      destinationURL: 'https://content.test:8443/a%20b/literal%25/chapter%3A1',
    })
  })

  test.each([
    { segments: [] },
    { segments: ['course-code'] },
    { segments: ['course-code', 'ftp%3A', 'content.test'] },
    { segments: ['course-code', 'https%3A'] },
    { segments: ['course-code', 'https%3A', 'content.test%'] },
  ])('rejects incomplete or unsupported route parameters', ({ segments }) => {
    expect(extractActivityLaunchParameters(segments)).toEqual({
      activityCode: segments[0] ?? null,
      destinationURL: null,
    })
  })
})

import { NextRequest } from 'next/server'

import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setProgress: vi.fn(),
  getCoreCommands: vi.fn(),
  getCoreAgentRequestContext: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('@/core-adapter', () => ({
  getCoreCommands: mocks.getCoreCommands,
  getCoreAgentRequestContext: mocks.getCoreAgentRequestContext,
}))
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: mocks.loggerError, warn: mocks.loggerWarn }),
}))

import { POST } from './route'

const DUPLICATE_MESSAGE = 'increments_for_other_pages contains duplicate target URLs'

const makeRequest = (body: unknown): NextRequest =>
  new NextRequest('https://gradebook.test/routes/agent/activity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('agent activity route set-progress validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCoreAgentRequestContext.mockResolvedValue({ requestId: 'request', agentAuth: {} })
    mocks.getCoreCommands.mockResolvedValue({
      agent: { activityState: { setProgress: mocks.setProgress } },
    })
    // What core's command wrapper returns when the schema refinement finds two
    // spellings of one activity among the targets.
    mocks.setProgress.mockResolvedValue({
      ok: false,
      error: {
        code: 'ERR_VALIDATION',
        message: 'input validation failed',
        details: {
          issues: [
            { code: 'custom', path: ['increments_for_other_pages'], message: DUPLICATE_MESSAGE },
          ],
        },
      },
    })
  })

  const duplicateBody = {
    op: 'set-progress',
    progress_for_current_page: 0.5,
    increments_for_other_pages: [
      { url: 'https://content.test/lesson?token=secret-token-value', factor: 0.5 },
      { url: 'HTTPS://CONTENT.TEST:443/lesson#secret-fragment', factor: 0.25 },
    ],
  }

  test('passes the submitted targets to core unchanged', async () => {
    await POST(makeRequest(duplicateBody))

    expect(mocks.setProgress).toHaveBeenCalledWith(expect.anything(), {
      progress_for_current_page: 0.5,
      increments_for_other_pages: duplicateBody.increments_for_other_pages,
    })
  })

  test('responds 400 with exactly the error status and code for canonical duplicates', async () => {
    const response = await POST(makeRequest(duplicateBody))

    expect(response.status).toBe(400)
    // Exactly this body: no issues, message, or submitted target reaches the
    // agent, and no partial progress is reported for a rejected submission.
    expect(await response.json()).toStrictEqual({ status: 'error', code: 'ERR_VALIDATION' })
  })

  test('logs the failed set-progress operation at warn without submitted values', async () => {
    await POST(makeRequest(duplicateBody))

    expect(mocks.loggerError).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        requestId: 'request',
        op: 'set-progress',
        code: 'ERR_VALIDATION',
        message: 'input validation failed',
      },
      'agent activity-state command failed'
    )

    const logged = JSON.stringify(mocks.loggerWarn.mock.calls)
    expect(logged.toLowerCase()).not.toContain('content.test')
    expect(logged).not.toContain('secret-token-value')
    expect(logged).not.toContain('secret-fragment')
    expect(logged).not.toContain('increments_for_other_pages')
    expect(logged).not.toContain('factor')
  })
})

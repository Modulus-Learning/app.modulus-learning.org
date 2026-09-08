import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  list: vi.fn(),
  preview: vi.fn(),
}))

vi.mock('@/core-adapter', () => ({
  getCoreAdminRequestContext: mocks.context,
  getCoreCommands: async () => ({
    admin: {
      activityUrlAllowlist: {
        listAllowlistRules: mocks.list,
        previewAllowlistImpact: mocks.preview,
      },
    },
  }),
}))

import { listAllowlistRules } from './list'
import { previewAllowlistImpact } from './preview'

const ruleId = '019c2d8e-842a-7715-a323-a7e31427db2d'
const otherId = '019c2d8e-842a-7715-a323-a7e31427db2e'
const selected = { id: ruleId, base_url: 'https://content.test/course', is_enabled: true }
const formData = () => {
  const data = new FormData()
  data.set('excluded_rule_id', ruleId)
  return data
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.context.mockResolvedValue({ adminAuth: {} })
  mocks.list.mockResolvedValue({ ok: true, data: { rules: [selected] } })
  mocks.preview.mockResolvedValue({
    ok: true,
    data: { total_activities: 1, grandfathered_count: 1, grandfathered_sample: [] },
  })
})

describe('allowlist impact action', () => {
  test('previews an explicit empty policy when removing the only enabled rule', async () => {
    const result = await previewAllowlistImpact({ status: 'idle' }, formData())
    expect(mocks.preview).toHaveBeenCalledWith(expect.anything(), { base_urls: [] })
    expect(result).toMatchObject({ status: 'success', impact: { grandfathered_count: 1 } })
  })

  test('retains overlapping enabled rules and preserves commas in URLs', async () => {
    mocks.list.mockResolvedValue({
      ok: true,
      data: {
        rules: [
          selected,
          { id: otherId, base_url: 'https://content.test', is_enabled: true },
          { id: 'comma', base_url: 'https://content.test/a,b', is_enabled: true },
          { id: 'disabled', base_url: 'https://disabled.test', is_enabled: false },
        ],
      },
    })
    await previewAllowlistImpact({ status: 'idle' }, formData())
    expect(mocks.preview).toHaveBeenCalledWith(expect.anything(), {
      base_urls: ['https://content.test', 'https://content.test/a,b'],
    })
  })

  test('deleting an already disabled rule leaves the enabled policy intact', async () => {
    mocks.list.mockResolvedValue({
      ok: true,
      data: {
        rules: [
          { ...selected, is_enabled: false },
          { id: otherId, base_url: 'https://other.test', is_enabled: true },
        ],
      },
    })
    await previewAllowlistImpact({ status: 'idle' }, formData())
    expect(mocks.preview).toHaveBeenCalledWith(expect.anything(), {
      base_urls: ['https://other.test'],
    })
  })

  test('rejects an absent rule ID instead of previewing the current policy', async () => {
    expect(await previewAllowlistImpact({ status: 'idle' }, new FormData())).toMatchObject({
      status: 'failed',
    })
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  test('reports a rule removed since the edit page was opened', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: { rules: [] } })
    expect(await previewAllowlistImpact({ status: 'idle' }, formData())).toMatchObject({
      status: 'failed',
      message: 'This allowlist rule can no longer be found.',
    })
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  test('does not turn a failed policy read into a deny-all preview', async () => {
    mocks.list.mockResolvedValue({ ok: false, error: { code: 'ERR_DATABASE' } })
    expect(await previewAllowlistImpact({ status: 'idle' }, formData())).toMatchObject({
      status: 'failed',
    })
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  test('reports a failed count without presenting an impact', async () => {
    mocks.preview.mockResolvedValue({ ok: false, error: { code: 'ERR_DATABASE' } })
    const result = await previewAllowlistImpact({ status: 'idle' }, formData())
    expect(result.status).toBe('failed')
    expect(result.impact).toBeUndefined()
  })
})

describe('allowlist list loading', () => {
  test('preserves a successful empty list', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: { rules: [] } })
    expect(await listAllowlistRules('en')).toEqual({ status: 'success', rules: [] })
  })

  test('preserves loaded rules', async () => {
    expect(await listAllowlistRules('en')).toEqual({ status: 'success', rules: [selected] })
  })

  test.each(['ERR_FORBIDDEN', 'ERR_DATABASE'])('distinguishes %s from no rules', async (code) => {
    mocks.list.mockResolvedValue({ ok: false, error: { code } })
    const result = await listAllowlistRules('en')
    expect(result).toMatchObject({ status: 'failed', message: expect.any(String) })
    expect(result).not.toHaveProperty('rules')
  })

  test('reports a missing session without reading rules', async () => {
    mocks.context.mockResolvedValue(null)
    expect(await listAllowlistRules('en')).toEqual({ status: 'failed', message: 'Not logged in.' })
    expect(mocks.list).not.toHaveBeenCalled()
  })
})

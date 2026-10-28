import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canvasAdapter } from '@/lms/canvas/index.js'
import { assertLmsAdapter, LMS_CONTRACT_VERSION } from '@/lms/contract.js'
import { syntheticAdapter } from '@/test-support/lms.js'

describe('assertLmsAdapter', () => {
  it('accepts an adapter that implements this build’s contract version', () => {
    assert.equal(canvasAdapter().contractVersion, LMS_CONTRACT_VERSION)
    assert.doesNotThrow(() => assertLmsAdapter(canvasAdapter()))
    assert.doesNotThrow(() => assertLmsAdapter(syntheticAdapter()))
  })

  it('refuses an adapter built for another contract version', () => {
    assert.throws(
      () => assertLmsAdapter(syntheticAdapter({ contractVersion: LMS_CONTRACT_VERSION + 1 })),
      /contract version/
    )
  })
})

describe('canvasAdapter', () => {
  it('declares Canvas capabilities and identity', () => {
    const adapter = canvasAdapter()
    assert.equal(adapter.id, 'canvas')
    assert.deepEqual(adapter.capabilities, {
      deepLinking: true,
      termMetadata: true,
      registrationConfig: true,
    })
  })

  it('returns a fresh copy of its deep-link fields', () => {
    const adapter = canvasAdapter()
    const fields = adapter.deepLinkCustomFields()
    fields['Canvas.term.id'] = 'mutated'
    assert.equal(adapter.deepLinkCustomFields()['Canvas.term.id'], '$Canvas.term.id')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'

import { createAuthorizationRequestParams, getQueryParams } from './auth.js'

const SCOPE_ID = '019c3298-2644-72f8-83c6-cdc77cc2d90e'

describe('agent scope authorization transport', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/activity')
  })

  it('captures and removes a fresh launch scope alongside the issuer', () => {
    window.history.replaceState(
      null,
      '',
      `/activity?modulus=https%3A%2F%2Fgradebook.test&scope_id=${SCOPE_ID}&authored=one#section`
    )

    const params = getQueryParams()

    expect(params.issuer).toBe('https://gradebook.test')
    expect(params.scope_id).toBe(SCOPE_ID)
    expect(window.location.search).toBe('?authored=one')
    expect(window.location.hash).toBe('#section')
  })

  it('sends a fresh scope label only when one was supplied', () => {
    const common = {
      redirect_uri: 'https://content.test/activity',
      state: 'state',
      code_challenge: 'challenge',
    }

    expect(createAuthorizationRequestParams({ ...common, scope_id: SCOPE_ID })).toMatchObject({
      scope_id: SCOPE_ID,
    })
    expect(createAuthorizationRequestParams({ ...common, scope_id: undefined })).not.toHaveProperty(
      'scope_id'
    )
  })
})

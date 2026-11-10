import { describe, expect, test } from 'vitest'

import { pageSizeItems } from './page-size'

describe('pageSizeItems', () => {
  test('a preset page size gives the presets unchanged', () => {
    expect(pageSizeItems(30).map((item) => item.value)).toEqual(['15', '30', '50', '100'])
  })

  test('a non-preset page size is added in numeric order', () => {
    expect(pageSizeItems('25').map((item) => item.value)).toEqual(['15', '25', '30', '50', '100'])
  })
})

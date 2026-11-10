import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router'

import { describe, expect, test } from 'vitest'

import { keepSearch, searchAsStrings } from './search-params'

// Regression: list routes coerced every search value to a string in
// `validateSearch`. The router then serialised `"true"` and `"2"` with JSON
// quotes (`desc=%22true%22`), so the sortable headings, which read the raw
// query string, never saw `desc=true` and could not toggle the sort.

const roundTrip = (query: string, keys?: readonly string[]) =>
  defaultStringifySearch(keepSearch(keys)(defaultParseSearch(query)))

describe('keepSearch', () => {
  test('a validated search serialises back without JSON quotes', () => {
    expect(roundTrip('?order=full_name&desc=false&page=2')).toBe(
      '?order=full_name&desc=false&page=2'
    )
  })

  test('drops keys outside the allowed list', () => {
    expect(roundTrip('?order=progress&desc=true&other=x', ['order', 'desc'])).toBe(
      '?order=progress&desc=true'
    )
  })
})

describe('searchAsStrings', () => {
  test('hands the loader string values, as the Next pages received them', () => {
    expect(searchAsStrings(defaultParseSearch('?desc=true&page=2&order=updated_at'))).toEqual({
      desc: 'true',
      page: '2',
      order: 'updated_at',
    })
  })
})

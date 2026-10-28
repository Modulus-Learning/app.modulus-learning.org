// partial-date.test.js
import { expect, test } from 'vitest'

import { PartialDate } from './partial-date'

test('create new PartialDate with year month and day', () => {
  const partialDate = new PartialDate(2024, 2, 12)
  const value = partialDate.getValue()
  expect(value).toBe(20240212)
})

test('create new PartialDate with year and month', () => {
  const partialDate = new PartialDate(2024, 2)
  const value = partialDate.getValue()
  expect(value).toBe(20240200)
})

test('create new PartialDate with year', () => {
  const partialDate = new PartialDate(2024)
  const value = partialDate.getValue()
  expect(value).toBe(20240000)
})

test('new PartialDate from static load method', () => {
  const partialDate = PartialDate.load(20240622)
  const value = partialDate.getValue()
  expect(value).toBe(20240622)
})

test('new PartialDate to string', () => {
  const partialDate = new PartialDate(2024, 2, 12)
  const value = partialDate.toString()
  expect(value).toBe('2024-02-12')
})

test('new PartialDate to short', () => {
  const partialDate = new PartialDate(2024, 2, 12)
  const value = partialDate.toShort()
  expect(value).toBe('12/02/2024')
})

test('new PartialDate to medium', () => {
  const partialDate = new PartialDate(2024, 2, 12)
  const value = partialDate.toMedium()
  expect(value).toBe('12 Feb 2024')
})

test('new PartialDate to long', () => {
  const partialDate = new PartialDate(2024, 2, 12)
  const value = partialDate.toLong()
  expect(value).toBe('12 February 2024')
})

test('getYear from PartialDate', () => {
  const partialDate = PartialDate.load(20000000)
  const year = partialDate.getYear()
  expect(year).toBe(2000)
})

test('static toString from PartialDate', () => {
  const result = PartialDate.toString(20001114)
  expect(result).toBe('2000-11-14')
})

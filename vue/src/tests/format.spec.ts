import { describe, it, expect } from 'vitest'

import { formatCents, formatDate, parseDollarsToCents } from '../helpers/format'

describe('formatCents', () => {
  it('shows integer cents as dollars', () => {
    expect(formatCents(0)).toBe('$0.00')
    expect(formatCents(2550)).toBe('$25.50')
    expect(formatCents(5)).toBe('$0.05')
  })
})

describe('parseDollarsToCents', () => {
  it.each([
    ['25', 2500],
    ['25.5', 2550],
    ['25.50', 2550],
    ['$25.50', 2550],
    [' 1,250.00 ', 125000],
    ['0', 0],
    ['0.07', 7],
  ])('%s -> %i cents', (text, cents) => {
    expect(parseDollarsToCents(text)).toBe(cents)
  })

  it.each(['', 'abc', '-5', '25.505', '25.5.0', '$'])('rejects %j', (text) => {
    expect(parseDollarsToCents(text)).toBeNull()
  })

  it('never drifts by a cent from floating-point maths', () => {
    // 0.29 * 100 is 28.999999999999996 in floating point
    expect(parseDollarsToCents('0.29')).toBe(29)
    expect(parseDollarsToCents('19.99')).toBe(1999)
  })
})

describe('formatDate', () => {
  it('reads a stored date in UTC so it never shifts a day', () => {
    expect(formatDate('2026-10-14')).toBe('Oct 14, 2026')
    expect(formatDate('2026-10-14T23:30:00.000Z')).toBe('Oct 14, 2026')
  })
})

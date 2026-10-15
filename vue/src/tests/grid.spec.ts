import { describe, it, expect } from 'vitest'
import { mostRecentSunday, yearAnchor, pastYears, toDateString, getPatternIndexForDate } from '../helpers/grid'

describe('mostRecentSunday', () => {
  it('returns the preceding Sunday for a mid-week date', () => {
    // 2026-01-07 is a Wednesday
    const result = mostRecentSunday(new Date('2026-01-07T12:00:00Z'))
    expect(toDateString(result)).toBe('2026-01-04')
  })

  it('returns the same date when it is already a Sunday', () => {
    const result = mostRecentSunday(new Date('2026-01-04T00:00:00Z'))
    expect(toDateString(result)).toBe('2026-01-04')
  })
})

describe('yearAnchor', () => {
  it('anchors to the most recent Sunday on/before Jan 1 of the given year', () => {
    // Jan 1 2025 is a Wednesday, so the preceding Sunday is Dec 29 2024
    expect(toDateString(yearAnchor(2025))).toBe('2024-12-29')
  })

  it('anchors on Jan 1 itself when it is a Sunday', () => {
    // Jan 1 2023 is a Sunday
    expect(toDateString(yearAnchor(2023))).toBe('2023-01-01')
  })
})

describe('pastYears', () => {
  it('returns the last 10 full years, most recent first', () => {
    expect(pastYears(new Date('2026-01-07T12:00:00Z'))).toEqual([2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016])
  })

  it('never includes the current year, even on Dec 31', () => {
    expect(pastYears(new Date('2026-12-31T23:00:00Z'))[0]).toBe(2025)
  })
})

describe('getPatternIndexForDate', () => {
  const startDate = '2026-01-04' // Sunday
  const onePattern = [0, 1, 2, 3, 4, 0, 0] // 1 week

  it('returns null before start_date', () => {
    expect(getPatternIndexForDate(onePattern, startDate, false, undefined, '2026-01-03')).toBeNull()
  })

  it('indexes directly within the first pass through the pattern', () => {
    expect(getPatternIndexForDate(onePattern, startDate, false, undefined, '2026-01-04')).toBe(0)
    expect(getPatternIndexForDate(onePattern, startDate, false, undefined, '2026-01-07')).toBe(3)
  })

  it('returns null past the pattern for a one-off (non-repeating) design', () => {
    expect(getPatternIndexForDate(onePattern, startDate, false, undefined, '2026-01-11')).toBeNull()
  })

  it('tiles indefinitely past the pattern when repeatIndefinitely is true', () => {
    const twoWeekPattern = [0, 1, 2, 3, 4, 0, 1, 1, 1, 1, 1, 1, 1, 1]
    expect(getPatternIndexForDate(twoWeekPattern, startDate, true, undefined, '2026-01-18')).toBe(0)
    expect(getPatternIndexForDate(twoWeekPattern, startDate, true, undefined, '2026-01-21')).toBe(3)
  })

  it('tiles up to and including a set recurrenceEndDate, then stops', () => {
    expect(getPatternIndexForDate(onePattern, startDate, false, '2026-01-24', '2026-01-18')).toBe(0)
    expect(getPatternIndexForDate(onePattern, startDate, false, '2026-01-24', '2026-01-24')).toBe(6)
    expect(getPatternIndexForDate(onePattern, startDate, false, '2026-01-24', '2026-01-25')).toBeNull()
  })
})

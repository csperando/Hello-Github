import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mostRecentSunday, todayAnchor, currentYearAnchor, toDateString, getPatternIndexForDate } from '../helpers/grid'

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

describe('todayAnchor / currentYearAnchor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-07T12:00:00Z')) // a Wednesday
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('todayAnchor defaults to the most recent Sunday on/before now', () => {
    expect(toDateString(todayAnchor())).toBe('2026-01-04')
  })

  it('currentYearAnchor anchors to the most recent Sunday on/before Jan 1 of this year', () => {
    // Jan 1 2026 is a Thursday, so the preceding Sunday is Dec 28 2025
    expect(toDateString(currentYearAnchor())).toBe('2025-12-28')
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

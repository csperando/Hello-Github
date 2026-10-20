import { describe, it, expect } from 'vitest'
import {
  mostRecentSunday,
  yearAnchor,
  pastYears,
  toDateString,
  getPatternIndexForDate,
  weeksInYear,
  gridCellDate,
  monthLabelWeeks,
  remapGridToYear,
} from '../helpers/grid'

// 2000-2031 spans a full 28-year Gregorian weekday cycle plus margin, so every
// (Jan 1 weekday x leap/non-leap) combination is covered - including the
// leap-years-starting-on-Saturday (2000, 2028) that need a 54th column.
const ALL_YEARS = Array.from({ length: 32 }, (_, i) => 2000 + i)

/** Every date of `year` as YYYY-MM-DD, built independently of the helpers under test. */
function datesOfYear(year: number): string[] {
  const dates: string[] = []
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

/** Every cell of `year`'s grid as { week, day, date }. */
function gridCells(year: number) {
  const cells: { week: number; day: number; date: string }[] = []
  for (let week = 0; week < weeksInYear(year); week++) {
    for (let day = 0; day < 7; day++) {
      cells.push({ week, day, date: toDateString(gridCellDate(year, week, day)) })
    }
  }
  return cells
}

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
    expect(getPatternIndexForDate(onePattern, { start_date: startDate, repeat_indefinitely: false }, '2026-01-03')).toBeNull()
  })

  it('indexes directly within the first pass through the pattern', () => {
    expect(getPatternIndexForDate(onePattern, { start_date: startDate, repeat_indefinitely: false }, '2026-01-04')).toBe(0)
    expect(getPatternIndexForDate(onePattern, { start_date: startDate, repeat_indefinitely: false }, '2026-01-07')).toBe(3)
  })

  it('returns null past the pattern for a one-off (non-repeating) design', () => {
    expect(getPatternIndexForDate(onePattern, { start_date: startDate, repeat_indefinitely: false }, '2026-01-11')).toBeNull()
  })

  it('tiles indefinitely past the pattern when repeatIndefinitely is true', () => {
    const twoWeekPattern = [0, 1, 2, 3, 4, 0, 1, 1, 1, 1, 1, 1, 1, 1]
    expect(getPatternIndexForDate(twoWeekPattern, { start_date: startDate, repeat_indefinitely: true }, '2026-01-18')).toBe(0)
    expect(getPatternIndexForDate(twoWeekPattern, { start_date: startDate, repeat_indefinitely: true }, '2026-01-21')).toBe(3)
  })

  it('tiles a custom range forward through Dec 31 of its year, then stops', () => {
    const schedule = { start_date: '2025-12-14', repeat_indefinitely: false, custom_range: true, year: 2025 }
    expect(getPatternIndexForDate(onePattern, schedule, '2025-12-13')).toBeNull() // never before the start
    expect(getPatternIndexForDate(onePattern, schedule, '2025-12-24')).toBe(3) // tiled into the 2nd week
    expect(getPatternIndexForDate(onePattern, schedule, '2025-12-31')).toBe(3)
    expect(getPatternIndexForDate(onePattern, schedule, '2026-01-01')).toBeNull()
  })

  it('paints a pattern once without custom_range', () => {
    const schedule = { start_date: '2025-12-14', repeat_indefinitely: false, custom_range: false, year: 2025 }
    expect(getPatternIndexForDate(onePattern, schedule, '2025-12-17')).toBe(3)
    expect(getPatternIndexForDate(onePattern, schedule, '2025-12-24')).toBeNull()
  })

  it('tiles up to and including a set recurrenceEndDate, then stops', () => {
    expect(getPatternIndexForDate(onePattern, { start_date: startDate, repeat_indefinitely: false, recurrence_end_date: '2026-01-24' }, '2026-01-18')).toBe(0)
    expect(getPatternIndexForDate(onePattern, { start_date: startDate, repeat_indefinitely: false, recurrence_end_date: '2026-01-24' }, '2026-01-24')).toBe(6)
    expect(getPatternIndexForDate(onePattern, { start_date: startDate, repeat_indefinitely: false, recurrence_end_date: '2026-01-24' }, '2026-01-25')).toBeNull()
  })
})

describe.each(ALL_YEARS)('year grid for %i', (year) => {
  it('holds every day of the year exactly once', () => {
    const inYear = gridCells(year).filter((c) => c.date.startsWith(`${year}-`)).map((c) => c.date)
    expect(inYear).toEqual(datesOfYear(year))
  })

  it('only spills into the neighbouring years in its first and last columns', () => {
    const weeks = weeksInYear(year)
    for (const cell of gridCells(year)) {
      if (cell.date < `${year}-01-01`) expect(cell.week).toBe(0)
      if (cell.date > `${year}-12-31`) expect(cell.week).toBe(weeks - 1)
    }
  })

  it('has no wasted column - first and last both hold a day of the year', () => {
    const cells = gridCells(year)
    const weeks = weeksInYear(year)
    expect(cells.some((c) => c.week === 0 && c.date.startsWith(`${year}-`))).toBe(true)
    expect(cells.some((c) => c.week === weeks - 1 && c.date.startsWith(`${year}-`))).toBe(true)
  })

  it('places each row on its weekday (row 0 = Sunday)', () => {
    for (const cell of gridCells(year)) {
      expect(new Date(`${cell.date}T00:00:00Z`).getUTCDay()).toBe(cell.day)
    }
  })

  it('labels exactly Jan-Dec, each on the column holding that month\'s 1st', () => {
    const labels = monthLabelWeeks(year)
    expect(labels.map((l) => l.month)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

    const cells = gridCells(year)
    labels.forEach(({ month, week }) => {
      const first = `${year}-${String(month + 1).padStart(2, '0')}-01`
      expect(cells.find((c) => c.date === first)?.week).toBe(week)
    })
  })

  it('spaces month labels at least 4 columns apart, so the 4-column-wide labels never overlap', () => {
    const weeks = monthLabelWeeks(year).map((l) => l.week)
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i]! - weeks[i - 1]!).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('weeksInYear', () => {
  it('needs a 54th column for a leap year starting on a Saturday', () => {
    expect(weeksInYear(2000)).toBe(54)
    expect(weeksInYear(2028)).toBe(54)
  })

  it('is 53 otherwise', () => {
    expect(weeksInYear(2025)).toBe(53)
    expect(weeksInYear(2023)).toBe(53) // starts on a Sunday
    expect(weeksInYear(2016)).toBe(53) // leap year starting on a Friday
  })
})

describe('remapGridToYear', () => {
  /** A full grid for `year` with every in-year cell painted. */
  function fullyPainted(year: number): number[] {
    return gridCells(year).map((c) => (c.date.startsWith(`${year}-`) ? 1 : 0))
  }

  it('keeps every cell in the same column and row', () => {
    // 2025 -> 2024: both 53 columns; mid-year cells keep their exact index
    const grid = new Array(53 * 7).fill(0)
    grid[20 * 7 + 3] = 1
    grid[30 * 7 + 6] = 2

    const remapped = remapGridToYear(grid, 2024)

    expect(remapped).toHaveLength(53 * 7)
    expect(remapped[20 * 7 + 3]).toBe(1)
    expect(remapped[30 * 7 + 6]).toBe(2)
    expect(remapped.filter((l) => l > 0)).toHaveLength(2)
  })

  it.each(ALL_YEARS.flatMap((from) => [from - 1, from + 1].map((to) => [from, to])))(
    '%i -> %i: never paints a day outside the new year, and keeps every cell that stays inside it',
    (from, to) => {
      const grid = fullyPainted(from)
      const remapped = remapGridToYear(grid, to)
      const toCells = gridCells(to)

      expect(remapped).toHaveLength(weeksInYear(to) * 7)
      toCells.forEach((cell, idx) => {
        const inNewYear = cell.date.startsWith(`${to}-`)
        expect(remapped[idx]).toBe(inNewYear ? (grid[idx] ?? 0) : 0)
      })
    },
  )

  it("drops the 54th column when moving out of a 54-column year", () => {
    const grid = new Array(54 * 7).fill(0)
    grid[53 * 7 + 0] = 1 // Sun 2028-12-31, only in 2028's 54th column
    grid[52 * 7 + 1] = 1 // Mon of the 53rd column, which 2027 also has

    const remapped = remapGridToYear(grid, 2027) // 53 columns

    expect(remapped.filter((l) => l > 0)).toHaveLength(1)
    expect(remapped[52 * 7 + 1]).toBe(1)
  })
})

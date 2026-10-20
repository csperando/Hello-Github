// Mirrors main.css's --color-grid-0..4 tokens exactly - kept in sync by hand
// since this is consumed as per-cell data, not CSS, and can't reference var().
export const LEVEL_COLORS = [
  "oklch(24% 0.01 250)",
  "oklch(32% 0.07 145)",
  "oklch(45% 0.12 145)",
  "oklch(58% 0.16 145)",
  "oklch(72% 0.19 145)",
]

/** Most recent Sunday on/before `date` (UTC, date-only - time of day is ignored). */
export function mostRecentSunday(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d
}

/** How many past years the editor offers - kept short for now; may grow (e.g. back to the user's GitHub join year). */
export const PAST_YEAR_COUNT = 10

/** Grid anchor for a year: the most recent Sunday on/before Jan 1, matching GitHub's own year layout. */
export function yearAnchor(year: number): Date {
  return mostRecentSunday(new Date(Date.UTC(year, 0, 1)))
}

/** The last PAST_YEAR_COUNT full calendar years before `now` (UTC), most recent first. */
export function pastYears(now: Date = new Date()): number[] {
  const currentYear = now.getUTCFullYear()
  return Array.from({ length: PAST_YEAR_COUNT }, (_, i) => currentYear - 1 - i)
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const DAY_MS = 86400000

/**
 * Week columns a year's grid needs: from its anchor through the week holding
 * Dec 31. Usually 53, but 54 when a leap year starts on a Saturday (e.g. 2028).
 */
export function weeksInYear(year: number): number {
  const anchor = yearAnchor(year).getTime()
  return Math.floor((Date.UTC(year, 11, 31) - anchor) / (7 * DAY_MS)) + 1
}

/** The date of the cell at (week column, day row - 0 = Sunday) in `year`'s grid. */
export function gridCellDate(year: number, week: number, day: number): Date {
  const date = yearAnchor(year)
  date.setUTCDate(date.getUTCDate() + week * 7 + day)
  return date
}

/**
 * One label per month of `year`, on the week column holding that month's 1st -
 * always exactly 12, Jan-Dec. (Labelling by each column's Sunday instead gives
 * a stray leading "dec" whenever Jan 1 isn't a Sunday.)
 */
export function monthLabelWeeks(year: number): { month: number; week: number }[] {
  const anchor = yearAnchor(year).getTime()
  return Array.from({ length: 12 }, (_, month) => ({
    month,
    week: Math.floor((Date.UTC(year, month, 1) - anchor) / (7 * DAY_MS)),
  }))
}

/**
 * Copies a grid (week-major: idx = week * 7 + day) onto `toYear`'s grid
 * column by column, so the design keeps its position on screen. Each column
 * now covers different dates, so any cell landing on a day outside `toYear`
 * - at either end, or a 54th column moving into a 53-column year - is dropped.
 */
export function remapGridToYear(grid: number[], toYear: number): number[] {
  const weeks = weeksInYear(toYear)
  return Array.from({ length: weeks * 7 }, (_, idx) => {
    const inYear = gridCellDate(toYear, Math.floor(idx / 7), idx % 7).getUTCFullYear() === toYear
    return inYear ? (grid[idx] ?? 0) : 0
  })
}

/** The schedule fields of a selection that place its pattern on the calendar - mirrors the API's iScheduleFields. */
export interface iScheduleFields {
  start_date: string
  repeat_indefinitely: boolean
  recurrence_end_date?: string | null
  /** Tile forward from start_date through Dec 31 of `year`. */
  custom_range?: boolean
  year?: number
}

/**
 * Mirrors api/services/designs.schedule.ts's getPatternIndexForDate exactly -
 * same modulo-tiling formula, kept in sync by hand since there's no shared
 * package between api/ and vue/. Returns the index into `pattern` for
 * targetDate, or null if the design contributes nothing that day.
 */
export function getPatternIndexForDate(pattern: number[], schedule: iScheduleFields, targetDate: string): number | null {
  const {
    start_date: startDate,
    repeat_indefinitely: repeatIndefinitely,
    recurrence_end_date: recurrenceEndDate,
    custom_range: customRange,
    year,
  } = schedule
  const daysSinceStart = Math.round(
    (new Date(`${targetDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000,
  )
  if (daysSinceStart < 0) return null

  const patternWeeks = pattern.length / 7
  const week = Math.floor(daysSinceStart / 7)
  const dayOfWeek = daysSinceStart % 7

  if (week < patternWeeks) {
    return week * 7 + dayOfWeek
  }

  const isRepeating =
    repeatIndefinitely ||
    (customRange === true && year != null && targetDate <= `${year}-12-31`) ||
    (recurrenceEndDate != null && targetDate <= recurrenceEndDate)
  if (!isRepeating) return null

  const tiledWeek = week % patternWeeks
  return tiledWeek * 7 + dayOfWeek
}

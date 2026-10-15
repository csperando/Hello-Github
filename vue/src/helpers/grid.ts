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

/**
 * Mirrors api/services/designs.schedule.ts's getPatternIndexForDate exactly -
 * same modulo-tiling formula, kept in sync by hand since there's no shared
 * package between api/ and vue/. Returns the index into `pattern` for
 * targetDate, or null if the design contributes nothing that day.
 */
export function getPatternIndexForDate(
  pattern: number[],
  startDate: string,
  repeatIndefinitely: boolean,
  recurrenceEndDate: string | null | undefined,
  targetDate: string,
): number | null {
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

  const isRepeating = repeatIndefinitely || (recurrenceEndDate != null && targetDate <= recurrenceEndDate)
  if (!isRepeating) return null

  const tiledWeek = week % patternWeeks
  return tiledWeek * 7 + dayOfWeek
}

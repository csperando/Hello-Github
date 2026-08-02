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

/** "Today" tab anchor: the grid's first column is the most recent Sunday on/before today. */
export function todayAnchor(now: Date = new Date()): Date {
  return mostRecentSunday(now)
}

/** Current-year tab anchor: the most recent Sunday on/before Jan 1 of this year, for year-to-date designs. */
export function currentYearAnchor(now: Date = new Date()): Date {
  return mostRecentSunday(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)))
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

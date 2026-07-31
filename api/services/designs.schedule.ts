/** The scheduling fields of an iDesignSelection needed to place a pattern on the calendar. */
export interface iScheduleFields {
    start_date: string;
    repeat_indefinitely: boolean;
    recurrence_end_date?: string | null;
}

function daysSince(from: string, to: string): number {
    const fromMs = new Date(`${from}T00:00:00Z`).getTime();
    const toMs = new Date(`${to}T00:00:00Z`).getTime();
    return Math.round((toMs - fromMs) / 86400000);
}

/**
 * The day -> pattern-index lookup a future GitHub Actions runner will need
 * (see .claude/tmp/goal.md): given a design's pattern, a user's selection of
 * it (start_date/repeat_indefinitely/recurrence_end_date), and a target
 * date, returns the index into pattern for that day, or null if it
 * contributes nothing that day (before start_date, or finished - a one-off
 * selection past its end, or a bounded repeat past its recurrence_end_date).
 * Tiles past the pattern's natural end using the same modulo formula as the
 * editor's custom-range ghost-cell preview, applied along the calendar
 * timeline instead of visual grid columns.
 */
export function getPatternIndexForDate(pattern: number[], selection: iScheduleFields, targetDate: string): number | null {
    const { start_date: startDate, repeat_indefinitely: repeatIndefinitely, recurrence_end_date: recurrenceEndDate } = selection;

    const daysSinceStart = daysSince(startDate, targetDate);
    if (daysSinceStart < 0) return null;

    const patternWeeks = pattern.length / 7;
    const week = Math.floor(daysSinceStart / 7);
    const dayOfWeek = daysSinceStart % 7;

    if (week < patternWeeks) {
        return week * 7 + dayOfWeek;
    }

    const isRepeating = repeatIndefinitely || (recurrenceEndDate != null && targetDate <= recurrenceEndDate);
    if (!isRepeating) return null;

    const tiledWeek = week % patternWeeks;
    return tiledWeek * 7 + dayOfWeek;
}

/** Convenience wrapper: the pattern's intensity (0-4) for a given day, or null if none. */
export function getIntensityForDate(pattern: number[], selection: iScheduleFields, targetDate: string): number | null {
    const idx = getPatternIndexForDate(pattern, selection, targetDate);
    if (idx === null) return null;
    return pattern[idx] ?? null;
}

/**
 * Fixed commit-count tier per intensity level (0-4). GitHub's own graph
 * shading is presumed to use roughly fixed absolute thresholds rather than
 * being relative to each viewer's personal commit history (unconfirmed -
 * worth verifying empirically against real accounts before scale). These
 * numbers are a conservative best guess intended to land clearly within
 * each shade's band for a typical low-activity account, not derived from
 * an official spec, and are expected to be tuned once real rendering is
 * observed in practice.
 */
const COMMIT_COUNT_BY_INTENSITY: readonly [number, number, number, number, number] = [0, 2, 5, 8, 12];

export function getCommitCountForIntensity(intensity: number): number {
    if (!Number.isInteger(intensity) || intensity < 0 || intensity > 4) {
        throw new RangeError(`intensity must be an integer 0-4, got ${intensity}.`);
    }
    // safe: the range check above guarantees intensity is a valid tuple index
    return COMMIT_COUNT_BY_INTENSITY[intensity]!;
}

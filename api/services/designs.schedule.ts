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
/** One day's rendered contribution data, as returned by fetchContributionCalendar. */
export interface iContributionDay {
    count: number;
    level: number;
}

/**
 * Derives GitHub's per-user, per-year commit-count-tier constant `q` from a
 * set of already-rendered days (see .claude/tmp/research.md for the
 * reverse-engineering behind this). The general, validated formula is
 * `q = MAX(max(count at level 1)/1, max(count at level 2)/2, max(count at
 * level 3)/3)` - whichever degree boundary is tightest that year; an
 * earlier pass assumed the degree-2 term alone was sufficient, but that
 * only held by coincidence for one account's data and breaks on others.
 * Returns null when levels 1-3 are all absent from `days` - GitHub's real
 * algorithm is known to behave qualitatively differently (not just "a
 * smaller q") for such sparse years, so this is treated as "undefined,"
 * not silently computed as 0.
 */
export function computeQ(days: iContributionDay[]): number | null {
    const maxCountAtLevel = (level: number): number =>
        days.filter((day) => day.level === level).reduce((max, day) => Math.max(max, day.count), 0);

    const deg1Max = maxCountAtLevel(1);
    const deg2Max = maxCountAtLevel(2);
    const deg3Max = maxCountAtLevel(3);

    if (deg1Max === 0 && deg2Max === 0 && deg3Max === 0) return null;

    return Math.max(deg1Max / 1, deg2Max / 2, deg3Max / 3);
}

/**
 * Provisional cold-start q, used only when a user has no observed data at
 * all yet (no current or previous year's q in users_contributions). Picked
 * from the middle of the real per-account q range found in
 * .claude/tmp/research.md (roughly 2-19) - to be corrected by the
 * empirical validation pass against a scratch test account.
 */
export const DEFAULT_Q = 15;

/**
 * Given a q (see computeQ), derives one commit count per intensity 1-4 that
 * lands safely inside its intended band under `degree = MIN(4, CEIL(c/q))`,
 * biased toward the higher end of each band rather than its boundary -
 * landing a shade too dark reads better than landing a shade too light and
 * breaking the intended pattern. c_0 (intensity 0) is always 0 commits,
 * handled separately in getCommitCountForIntensity below.
 */
export function deriveCommitCounts(q: number): [number, number, number, number] {
    const c1 = Math.max(1, Math.ceil(q * 0.75));
    const c2 = Math.max(c1 + 1, Math.ceil(q * 1.75));
    const c3 = Math.max(c2 + 1, Math.ceil(q * 2.75));
    const c4 = Math.max(c3 + 1, Math.ceil(q * 3.5));
    return [c1, c2, c3, c4];
}

const COMMIT_COUNT_BY_INTENSITY: readonly [number, number, number, number, number] = [0, 2, 5, 8, 12];

export function getCommitCountForIntensity(intensity: number): number {
    if (!Number.isInteger(intensity) || intensity < 0 || intensity > 4) {
        throw new RangeError(`intensity must be an integer 0-4, got ${intensity}.`);
    }
    // safe: the range check above guarantees intensity is a valid tuple index
    return COMMIT_COUNT_BY_INTENSITY[intensity]!;
}

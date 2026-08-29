/**
 * Commit-intensity model overview (see .claude/tmp/research.md for the full
 * reverse-engineering methodology, out-of-sample data from 3 unrelated
 * GitHub accounts, and reusable verification snippets - this is a summary,
 * not a replacement for that document).
 *
 * GitHub's contribution-graph shading is relative to each viewer's own
 * commit history, not a fixed absolute count. The verified model:
 *
 *     degree = MIN(4, CEILING(contributions / q))
 *
 * an equal-width linear tier system with one constant `q` per user per
 * year. `q` is NOT predictable from raw daily counts alone (extensively
 * tested - percentile methods, outlier trimming, transforms - none
 * reproduce it); the only exact formula found is:
 *
 *     q = MAX(max(count @ level 1)/1, max(count @ level 2)/2, max(count @ level 3)/3)
 *
 * whichever degree boundary is tightest that year - not always the
 * degree-2 term alone, which only coincidentally sufficed for one account's
 * data. See computeQ.
 *
 * Since this formula needs a day already labeled with its rendered degree,
 * `q` can only be *observed*, not predicted in advance - so it's tracked
 * per-user in the `users_contributions` table (one row per user, `q` +
 * precomputed `commit_counts` for the current year, plus a previous-year
 * fallback pair for cold start at a calendar-year rollover) rather than
 * computed at design/schedule time. `ContributionRefreshService` (see
 * contributionRefresh.service.ts) refreshes this daily from GitHub's
 * public, unauthenticated contribution-calendar HTML (fetchContributionCalendar
 * in github.service.ts) - deliberately not the authenticated GraphQL API,
 * to avoid needing any token/scope to read a user's public contribution
 * data. See deriveCommitCounts for turning an observed `q` into actual
 * commit counts, and SchedulerService.getDueCommits for the fallback chain
 * (this year -> last year -> the closed-form DEFAULT_Q) that consumes it.
 *
 * Feedback-loop mitigation: since this app's own painted commits would
 * otherwise pollute the very data used to recompute `q`, the daily refresh
 * excludes any day already recorded in `run_log` for that user (a day this
 * app is known to have painted) before computing `q` - see
 * ContributionRefreshService.refreshForUser. For a design painted entirely
 * by this app (no organic activity), this means every day eventually gets
 * excluded and `q` has no fresh signal to refresh from - expected, not a
 * bug, and covered by the fallback chain above.
 *
 * assessDesignFeasibility flags designs unlikely to render reliably
 * (missing an anchor intensity level, or too few active days across the
 * year, per research.md's sparse-year finding) - detection only, no
 * product decision yet about what to do with a flagged design.
 *
 * STATUS: the model above is verified against organic human activity
 * (1,461+ real days across 3 accounts, 0 mismatches). Whether it holds
 * unchanged against a synthetic, painted-only distribution (few distinct
 * repeated values, as this app actually produces) is NOT yet empirically
 * validated - that requires pushing controlled commit patterns to a
 * scratch GitHub account with no pre-existing activity and observing the
 * real rendered result, which needs a human to provision (a scratch
 * account + a push-capable PAT). This is tracked as the remaining, not-yet-
 * completed steps in `.claude/tmp/plan.md`. Until that validation lands,
 * treat `deriveCommitCounts`'s safety-margin values, `DEFAULT_Q`, and
 * `assessDesignFeasibility`'s `MIN_ACTIVE_DAYS_PER_YEAR` threshold as
 * provisional. Re-check this whole model if painted patterns are ever
 * reported as rendering incorrectly, or if GitHub changes its
 * contribution-graph rendering.
 */

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

/** One day's rendered contribution data, as returned by fetchContributionCalendar. */
export interface iContributionDay {
    count: number;
    level: number;
}

/** The largest contribution count among days rendered at a given level, or 0 if none. */
export function maxContributionAtLevel(days: iContributionDay[], level: number): number {
    return days.filter((day) => day.level === level).reduce((max, day) => Math.max(max, day.count), 0);
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
    const deg1Max = maxContributionAtLevel(days, 1);
    const deg2Max = maxContributionAtLevel(days, 2);
    const deg3Max = maxContributionAtLevel(days, 3);

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
 * handled separately by callers (e.g. SchedulerService.getDueCommits).
 */
export function deriveCommitCounts(q: number): [number, number, number, number] {
    const c1 = Math.max(1, Math.ceil(q * 0.75));
    const c2 = Math.max(c1 + 1, Math.ceil(q * 1.75));
    const c3 = Math.max(c2 + 1, Math.ceil(q * 2.75));
    const c4 = Math.max(c3 + 1, Math.ceil(q * 3.5));
    return [c1, c2, c3, c4];
}

/**
 * Provisional hypothesis, not a derived constant - the exact threshold
 * where GitHub's real algorithm might start behaving unpredictably for a
 * sparse year is unconfirmed (see .claude/tmp/research.md's sparse-year
 * finding). To be corrected by the empirical validation pass in
 * .claude/tmp/plan.md.
 */
const MIN_ACTIVE_DAYS_PER_YEAR = 10;

export interface iFeasibilityAssessment {
    feasible: boolean;
    reason?: string;
}

/**
 * Flags designs unlikely to render reliably under the MIN(4, CEIL(c/q))
 * model - detection only, no product decision about what to do with a
 * flagged design (see .claude/tmp/goal.md). Realizes the design's full
 * intensity sequence across `targetYear` via getPatternIndexForDate's
 * tiling logic, not just the raw (often much shorter) pattern array, since
 * repeat_indefinitely/recurrence_end_date can multiply a short pattern into
 * many active days.
 */
export function assessDesignFeasibility(pattern: number[], selection: iScheduleFields, targetYear: number): iFeasibilityAssessment {
    const usedLevels = new Set<number>();
    let activeDays = 0;

    for (
        let date = new Date(`${targetYear}-01-01T00:00:00Z`);
        date.getUTCFullYear() === targetYear;
        date.setUTCDate(date.getUTCDate() + 1)
    ) {
        const dateStr = date.toISOString().slice(0, 10);
        const intensity = getIntensityForDate(pattern, selection, dateStr);
        if (intensity === null || intensity === 0) continue;

        usedLevels.add(intensity);
        activeDays++;
    }

    const missingAnchorLevel = [1, 2, 3].find((level) => !usedLevels.has(level));
    if (missingAnchorLevel !== undefined) {
        return {
            feasible: false,
            reason: `Design never uses intensity level ${missingAnchorLevel} in ${targetYear}, which breaks the anchor computeQ needs to derive a reliable q.`,
        };
    }

    if (activeDays < MIN_ACTIVE_DAYS_PER_YEAR) {
        return {
            feasible: false,
            reason: `Design has only ${activeDays} active day(s) in ${targetYear} (fewer than ${MIN_ACTIVE_DAYS_PER_YEAR}) - GitHub's real algorithm may collapse very sparse years so every active day renders at the max shade regardless of chosen count (see .claude/tmp/research.md's sparse-year finding).`,
        };
    }

    return { feasible: true };
}

import { iDesign } from "../models/designs";

function daysSince(from: string, to: string): number {
    const fromMs = new Date(`${from}T00:00:00Z`).getTime();
    const toMs = new Date(`${to}T00:00:00Z`).getTime();
    return Math.round((toMs - fromMs) / 86400000);
}

/**
 * The day -> pattern-index lookup a future GitHub Actions runner will need
 * (see .claude/tmp/goal.md section 3): given a design row and a target date,
 * returns the index into design.pattern for that day, or null if the design
 * contributes nothing that day (before start_date, or finished - a one-off
 * design past end_date, or a bounded repeat past its recurrence_end_date).
 * Tiles past end_date using the same modulo formula as the editor's
 * custom-range ghost-cell preview, applied along the calendar timeline
 * instead of visual grid columns.
 */
export function getPatternIndexForDate(design: iDesign, targetDate: string): number | null {
    const startDate = design.start_date as unknown as string;
    const pattern = design.pattern as unknown as number[];
    const repeatIndefinitely = design.repeat_indefinitely as unknown as boolean;
    const recurrenceEndDate = design.recurrence_end_date as unknown as string | undefined;

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
export function getIntensityForDate(design: iDesign, targetDate: string): number | null {
    const idx = getPatternIndexForDate(design, targetDate);
    if (idx === null) return null;
    return (design.pattern as unknown as number[])[idx] ?? null;
}

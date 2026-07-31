/**
 * The UTC-minus-local offset (in minutes) for `timeZone` at the instant
 * `date`. Positive means the zone is ahead of UTC (e.g. +330 for
 * Asia/Kolkata's UTC+5:30).
 */
function timezoneOffsetMinutesAt(date: Date, timeZone: string): number {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts: Record<string, string> = {};
    for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;

    const wallClockAsUTC = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    return (wallClockAsUTC - date.getTime()) / 60000;
}

/**
 * The UTC instant corresponding to `localHour:00:00` on `targetDate` in
 * `timezone` - what to stamp as GIT_AUTHOR_DATE/GIT_COMMITTER_DATE so a
 * commit lands on the correct day on the user's contribution graph
 * regardless of when the workflow that creates it actually runs (see
 * goal.md's day-semantics decision). Single-pass offset approximation:
 * exact except within a DST-transition window (at most a few hours, twice
 * a year for zones that observe DST) around the target instant, which is
 * an accepted, documented tradeoff rather than something this handles
 * precisely.
 */
export function computeCommitTimestamp(timezone: string, targetDate: string, localHour: number = 1): string {
    const guessUTC = new Date(`${targetDate}T${String(localHour).padStart(2, "0")}:00:00.000Z`);
    const offsetMinutes = timezoneOffsetMinutesAt(guessUTC, timezone);
    const actualUTC = new Date(guessUTC.getTime() - offsetMinutes * 60000);
    return actualUTC.toISOString();
}

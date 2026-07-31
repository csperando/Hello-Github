import { computeCommitTimestamp } from "../../services/scheduler.timing";

/** Independent check: does `isoInstant` actually display as `hour:00` on `date` in `timeZone`? */
function displaysAs(isoInstant: string, timeZone: string, expectedDate: string, expectedHour: number) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    const parts: Record<string, string> = {};
    for (const part of formatter.formatToParts(new Date(isoInstant))) parts[part.type] = part.value;

    expect(`${parts.year}-${parts.month}-${parts.day}`).toBe(expectedDate);
    expect(Number(parts.hour)).toBe(expectedHour);
    expect(parts.minute).toBe("00");
}

describe("computeCommitTimestamp", () => {
    it("is a no-op offset for UTC itself", () => {
        expect(computeCommitTimestamp("UTC", "2026-01-04", 1)).toBe("2026-01-04T01:00:00.000Z");
    });

    it("computes the correct UTC instant for a whole-hour-offset zone (America/Chicago, UTC-6 in January)", () => {
        const result = computeCommitTimestamp("America/Chicago", "2026-01-04", 1);
        expect(result).toBe("2026-01-04T07:00:00.000Z");
        displaysAs(result, "America/Chicago", "2026-01-04", 1);
    });

    it("computes the correct UTC instant for a half-hour-offset zone (Asia/Kolkata, UTC+5:30, no DST)", () => {
        const result = computeCommitTimestamp("Asia/Kolkata", "2026-01-04", 1);
        expect(result).toBe("2026-01-03T19:30:00.000Z");
        displaysAs(result, "Asia/Kolkata", "2026-01-04", 1);
    });

    it("defaults localHour to 1am when omitted", () => {
        expect(computeCommitTimestamp("UTC", "2026-01-04")).toBe("2026-01-04T01:00:00.000Z");
    });

    it("respects an explicit localHour", () => {
        displaysAs(computeCommitTimestamp("Asia/Kolkata", "2026-06-15", 14), "Asia/Kolkata", "2026-06-15", 14);
    });

    it("round-trips correctly for a zone west of UTC across a month boundary", () => {
        displaysAs(computeCommitTimestamp("Pacific/Honolulu", "2026-02-01", 1), "Pacific/Honolulu", "2026-02-01", 1);
    });
});

import { getPatternIndexForDate, getIntensityForDate, iScheduleFields } from "../../services/designs.schedule";

function selection(overrides: Partial<iScheduleFields>): iScheduleFields {
    return {
        start_date: "2026-01-04", // Sunday
        repeat_indefinitely: false,
        ...overrides,
    };
}

const onePattern = [0, 1, 2, 3, 4, 0, 0];

describe("getPatternIndexForDate", () => {
    it("returns null before start_date", () => {
        const s = selection({});
        expect(getPatternIndexForDate(onePattern, s, "2026-01-03")).toBeNull();
    });

    it("indexes directly within the first pass through the pattern", () => {
        const s = selection({});
        expect(getPatternIndexForDate(onePattern, s, "2026-01-04")).toBe(0); // start_date itself, day 0
        expect(getPatternIndexForDate(onePattern, s, "2026-01-07")).toBe(3); // Wednesday of week 0
        expect(getPatternIndexForDate(onePattern, s, "2026-01-10")).toBe(6); // last day of pattern (end_date equivalent)
    });

    it("returns null past the pattern's natural end for a one-off selection (repeat_indefinitely=false, recurrence_end_date=null)", () => {
        const s = selection({});
        expect(getPatternIndexForDate(onePattern, s, "2026-01-11")).toBeNull();
    });

    it("tiles indefinitely past the pattern's natural end when repeat_indefinitely is true", () => {
        const twoWeekPattern = [0, 1, 2, 3, 4, 0, 1, 1, 1, 1, 1, 1, 1, 1]; // 2-week pattern
        const s = selection({ repeat_indefinitely: true });

        // 3rd week after start (days 14-20) should wrap back to week 0 of the pattern
        expect(getPatternIndexForDate(twoWeekPattern, s, "2026-01-18")).toBe(0); // wraps to week 0, day 0
        expect(getPatternIndexForDate(twoWeekPattern, s, "2026-01-21")).toBe(3); // wraps to week 0, day 3

        // far future still tiles correctly (5 weeks after start = week 5, 5 % 2 = 1 -> week 1)
        expect(getPatternIndexForDate(twoWeekPattern, s, "2026-02-08")).toBe(7); // week 1, day 0
    });

    it("tiles up to and including a set recurrence_end_date, then stops", () => {
        const s = selection({
            repeat_indefinitely: false,
            recurrence_end_date: "2026-01-24", // repeats for 2 more weeks past the pattern's natural end
        });

        expect(getPatternIndexForDate(onePattern, s, "2026-01-18")).toBe(0); // 2nd Sunday past start, still repeating
        expect(getPatternIndexForDate(onePattern, s, "2026-01-24")).toBe(6); // exactly on recurrence_end_date (a Saturday)
        expect(getPatternIndexForDate(onePattern, s, "2026-01-25")).toBeNull(); // day after it lapses
    });
});

describe("getIntensityForDate", () => {
    it("returns the pattern's intensity value at the computed index", () => {
        const s = selection({});
        expect(getIntensityForDate(onePattern, s, "2026-01-07")).toBe(3);
    });

    it("returns null when there is no contribution that day", () => {
        const s = selection({});
        expect(getIntensityForDate(onePattern, s, "2026-01-11")).toBeNull();
    });
});

import { getPatternIndexForDate, getIntensityForDate } from "../../services/designs.schedule";
import { iDesign } from "../../models/designs";

function design(overrides: Partial<iDesign>): iDesign {
    return {
        id: "d1" as any,
        user_id: "u1" as any,
        name: "test" as any,
        is_public: false as any,
        start_date: "2026-01-04" as any, // Sunday
        end_date: "2026-01-10" as any, // 1 week pattern
        pattern: [0, 1, 2, 3, 4, 0, 0] as any,
        repeat_indefinitely: false as any,
        ...overrides,
    };
}

describe("getPatternIndexForDate", () => {
    it("returns null before start_date", () => {
        const d = design({});
        expect(getPatternIndexForDate(d, "2026-01-03")).toBeNull();
    });

    it("indexes directly within the first pass through the pattern", () => {
        const d = design({});
        expect(getPatternIndexForDate(d, "2026-01-04")).toBe(0); // start_date itself, day 0
        expect(getPatternIndexForDate(d, "2026-01-07")).toBe(3); // Wednesday of week 0
        expect(getPatternIndexForDate(d, "2026-01-10")).toBe(6); // end_date, last day of pattern
    });

    it("returns null past end_date for a one-off design (repeat_indefinitely=false, recurrence_end_date=null)", () => {
        const d = design({});
        expect(getPatternIndexForDate(d, "2026-01-11")).toBeNull();
    });

    it("tiles indefinitely past end_date when repeat_indefinitely is true", () => {
        const d = design({
            pattern: [0, 1, 2, 3, 4, 0, 1, 1, 1, 1, 1, 1, 1, 1] as any, // 2-week pattern
            end_date: "2026-01-17" as any,
            repeat_indefinitely: true as any,
        });

        // 3rd week after start (days 14-20) should wrap back to week 0 of the pattern
        expect(getPatternIndexForDate(d, "2026-01-18")).toBe(0); // wraps to week 0, day 0
        expect(getPatternIndexForDate(d, "2026-01-21")).toBe(3); // wraps to week 0, day 3

        // far future still tiles correctly (5 weeks after start = week 5, 5 % 2 = 1 -> week 1)
        expect(getPatternIndexForDate(d, "2026-02-08")).toBe(7); // week 1, day 0
    });

    it("tiles up to and including a set recurrence_end_date, then stops", () => {
        const d = design({
            repeat_indefinitely: false as any,
            recurrence_end_date: "2026-01-24" as any, // repeats for 2 more weeks past end_date
        });

        expect(getPatternIndexForDate(d, "2026-01-18")).toBe(0); // 2nd Sunday past start, still repeating
        expect(getPatternIndexForDate(d, "2026-01-24")).toBe(6); // exactly on recurrence_end_date (a Saturday)
        expect(getPatternIndexForDate(d, "2026-01-25")).toBeNull(); // day after it lapses
    });
});

describe("getIntensityForDate", () => {
    it("returns the pattern's intensity value at the computed index", () => {
        const d = design({});
        expect(getIntensityForDate(d, "2026-01-07")).toBe(3);
    });

    it("returns null when there is no contribution that day", () => {
        const d = design({});
        expect(getIntensityForDate(d, "2026-01-11")).toBeNull();
    });
});

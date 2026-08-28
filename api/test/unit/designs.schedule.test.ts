import { getPatternIndexForDate, getIntensityForDate, getCommitCountForIntensity, computeQ, deriveCommitCounts, DEFAULT_Q, iScheduleFields } from "../../services/designs.schedule";

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

describe("getCommitCountForIntensity", () => {
    it("maps 0 to 0 commits", () => {
        expect(getCommitCountForIntensity(0)).toBe(0);
    });

    it("maps intensity 1-4 to a strictly increasing commit count", () => {
        const counts: number[] = [1, 2, 3, 4].map(getCommitCountForIntensity);
        expect(counts[0]).toBeGreaterThan(0);
        for (let i = 1; i < counts.length; i++) {
            expect(counts[i]!).toBeGreaterThan(counts[i - 1]!);
        }
    });

    it("is deterministic for a given intensity", () => {
        expect(getCommitCountForIntensity(3)).toBe(getCommitCountForIntensity(3));
    });

    it("throws for an out-of-range or non-integer intensity", () => {
        expect(() => getCommitCountForIntensity(-1)).toThrow(RangeError);
        expect(() => getCommitCountForIntensity(5)).toThrow(RangeError);
        expect(() => getCommitCountForIntensity(1.5)).toThrow(RangeError);
    });
});

describe("computeQ", () => {
    it("takes the degree-2 constraint when it's the tightest (matches the account owner's real 2022 data, q=15)", () => {
        const days = [
            { count: 15, level: 1 },
            { count: 30, level: 2 },
            { count: 43, level: 3 },
        ];
        expect(computeQ(days)).toBe(15);
    });

    it("takes the degree-1 constraint when it's the tightest, not just degree-2 (matches an out-of-sample account's real data)", () => {
        const days = [
            { count: 10, level: 1 },
            { count: 18, level: 2 },
            { count: 24, level: 3 },
        ];
        expect(computeQ(days)).toBe(10);
    });

    it("takes the degree-3 constraint when it's the tightest", () => {
        const days = [
            { count: 2, level: 1 },
            { count: 6, level: 2 },
            { count: 21, level: 3 },
        ];
        expect(computeQ(days)).toBe(7);
    });

    it("uses only the max count within each degree, ignoring smaller same-degree days", () => {
        const days = [
            { count: 3, level: 1 },
            { count: 10, level: 1 },
            { count: 20, level: 2 },
        ];
        expect(computeQ(days)).toBe(10);
    });

    it("works from a single anchor degree when the others are entirely absent", () => {
        const days = [
            { count: 0, level: 0 },
            { count: 20, level: 2 },
            { count: 0, level: 0 },
        ];
        expect(computeQ(days)).toBe(10);
    });

    it("returns null when levels 1, 2, and 3 are all absent (the sparse-year degenerate case)", () => {
        const days = [
            { count: 0, level: 0 },
            { count: 1, level: 4 },
            { count: 3, level: 4 },
        ];
        expect(computeQ(days)).toBeNull();
    });

    it("returns null for an empty day list", () => {
        expect(computeQ([])).toBeNull();
    });
});

describe("deriveCommitCounts", () => {
    // degree = MIN(4, CEIL(c / q)) - the derived counts must land back in
    // their intended band under this same formula (self-consistency),
    // otherwise a "safety margin" choice would actually defeat its purpose.
    function degreeFor(c: number, q: number): number {
        return Math.min(4, Math.ceil(c / q));
    }

    it.each([1, 2, 7.5, 10, 15, 19, 20])("lands each derived count back in its intended degree for q=%s", (q) => {
        const [c1, c2, c3, c4] = deriveCommitCounts(q);
        expect(degreeFor(c1, q)).toBe(1);
        expect(degreeFor(c2, q)).toBe(2);
        expect(degreeFor(c3, q)).toBe(3);
        expect(degreeFor(c4, q)).toBe(4);
    });

    it("produces strictly increasing counts", () => {
        const [c1, c2, c3, c4] = deriveCommitCounts(15);
        expect(c2).toBeGreaterThan(c1);
        expect(c3).toBeGreaterThan(c2);
        expect(c4).toBeGreaterThan(c3);
    });

    it("biases each count toward the higher end of its band rather than the boundary (matches real q=15 data)", () => {
        const [c1, c2, c3, c4] = deriveCommitCounts(15);
        expect(c1).toBe(12);
        expect(c2).toBe(27);
        expect(c3).toBe(42);
        expect(c4).toBe(53);
    });

    it("is deterministic for a given q", () => {
        expect(deriveCommitCounts(15)).toEqual(deriveCommitCounts(15));
    });
});

describe("DEFAULT_Q", () => {
    it("is a positive number usable as a cold-start fallback", () => {
        expect(DEFAULT_Q).toBeGreaterThan(0);
    });
});

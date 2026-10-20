import {
    MAX_PATTERN_LENGTH,
    isValidPattern,
    isValidDateString,
    isSunday,
    computeEndDate,
    validateRecurrencePairing,
    extractDesignCreateInput,
    extractDesignUpdateInput,
    extractDesignSelectionCreateInput,
    extractDesignSelectionUpdateInput,
    isValidPastYear,
    validateYearPlacement,
    validateCustomRangePairing,
} from "../../services/designs.validation";

// Designs paint a *past* year - pin "now" to 2027 so the 2026 fixtures below are past.
beforeAll(() => {
    jest.useFakeTimers({ now: new Date("2027-06-01T12:00:00Z") });
});

afterAll(() => {
    jest.useRealTimers();
});

describe("isValidPattern", () => {
    it("accepts a non-empty array of integers 0-4 whose length is a multiple of 7", () => {
        expect(isValidPattern([0, 1, 2, 3, 4, 0, 0])).toBe(true);
        expect(isValidPattern(new Array(14).fill(2))).toBe(true);
    });

    it("rejects an empty array", () => {
        expect(isValidPattern([])).toBe(false);
    });

    it("rejects a length that is not a multiple of 7", () => {
        expect(isValidPattern([0, 1, 2])).toBe(false);
    });

    it("rejects values outside 0-4", () => {
        expect(isValidPattern([0, 1, 2, 3, 4, 5, 0])).toBe(false);
        expect(isValidPattern([0, 1, 2, 3, 4, -1, 0])).toBe(false);
        expect(isValidPattern([0, 1, 2, 3, 4, 1.5, 0])).toBe(false);
    });

    it("rejects a pattern longer than the max length cap", () => {
        expect(isValidPattern(new Array(MAX_PATTERN_LENGTH + 7).fill(0))).toBe(false);
    });

    it("rejects non-array input", () => {
        expect(isValidPattern("not an array")).toBe(false);
        expect(isValidPattern(undefined)).toBe(false);
        expect(isValidPattern(null)).toBe(false);
    });
});

describe("isValidDateString / isSunday", () => {
    it("recognizes a valid date string", () => {
        expect(isValidDateString("2026-01-04")).toBe(true);
    });

    it("rejects garbage or non-string input", () => {
        expect(isValidDateString("not a date")).toBe(false);
        expect(isValidDateString(12345)).toBe(false);
        expect(isValidDateString(undefined)).toBe(false);
    });

    it("2026-01-04 is a Sunday", () => {
        expect(isSunday("2026-01-04")).toBe(true);
    });

    it("2026-01-05 (Monday) is not a Sunday", () => {
        expect(isSunday("2026-01-05")).toBe(false);
    });
});

describe("computeEndDate", () => {
    it("computes the last day of a single-week pattern", () => {
        expect(computeEndDate("2026-01-04", 7)).toBe("2026-01-10");
    });

    it("computes the last day of a two-week pattern", () => {
        expect(computeEndDate("2026-01-04", 14)).toBe("2026-01-17");
    });
});

describe("validateRecurrencePairing", () => {
    it("allows repeat_indefinitely=true with no recurrence_end_date", () => {
        expect(validateRecurrencePairing(true, null, "2026-01-10")).toBeUndefined();
        expect(validateRecurrencePairing(true, undefined, "2026-01-10")).toBeUndefined();
    });

    it("rejects repeat_indefinitely=true with a recurrence_end_date set", () => {
        expect(validateRecurrencePairing(true, "2027-01-01", "2026-01-10")).toBeDefined();
    });

    it("allows repeat_indefinitely=false with no recurrence_end_date (one-off, no repeat)", () => {
        expect(validateRecurrencePairing(false, null, "2026-01-10")).toBeUndefined();
    });

    it("allows repeat_indefinitely=false with a recurrence_end_date after end_date (bounded repeat)", () => {
        expect(validateRecurrencePairing(false, "2027-01-01", "2026-01-10")).toBeUndefined();
    });

    it("rejects a recurrence_end_date that is not after end_date", () => {
        expect(validateRecurrencePairing(false, "2026-01-10", "2026-01-10")).toBeDefined();
        expect(validateRecurrencePairing(false, "2026-01-01", "2026-01-10")).toBeDefined();
    });
});

describe("extractDesignCreateInput", () => {
    const validBody = {
        start_date: "2026-01-04",
        year: 2026,
        pattern: [0, 1, 2, 3, 4, 0, 0],
    };

    it("accepts a minimal valid body", () => {
        const { input, error } = extractDesignCreateInput(validBody);

        expect(error).toBeUndefined();
        expect(input?.start_date).toBe("2026-01-04");
        expect(input?.pattern).toEqual(validBody.pattern);
        expect((input as any).end_date).toBeUndefined();
    });

    it("ignores mass-assignment fields like user_id/id/created_at", () => {
        const { input, error } = extractDesignCreateInput({
            ...validBody,
            id: "attacker-id",
            user_id: "attacker-user",
            created_at: "2000-01-01",
        } as any);

        expect(error).toBeUndefined();
        expect((input as any).id).toBeUndefined();
        expect((input as any).user_id).toBeUndefined();
        expect((input as any).created_at).toBeUndefined();
    });

    it("rejects a missing start_date", () => {
        const { error } = extractDesignCreateInput({ pattern: validBody.pattern } as any);
        expect(error).toBeDefined();
    });

    it("rejects a non-Sunday start_date", () => {
        const { error } = extractDesignCreateInput({ ...validBody, start_date: "2026-01-05" });
        expect(error).toBeDefined();
    });

    it("rejects an invalid pattern", () => {
        const { error } = extractDesignCreateInput({ ...validBody, pattern: [0, 1, 2] });
        expect(error).toBeDefined();
    });

    it("rejects an inconsistent repeat_indefinitely/recurrence_end_date pairing", () => {
        const { error } = extractDesignCreateInput({
            ...validBody,
            repeat_indefinitely: true,
            recurrence_end_date: "2027-01-01",
        });
        expect(error).toBeDefined();
    });

    it("passes through name/is_public/repeat_indefinitely when provided and valid", () => {
        const { input, error } = extractDesignCreateInput({
            ...validBody,
            name: "My Heart",
            is_public: true,
            repeat_indefinitely: true,
        });

        expect(error).toBeUndefined();
        expect(input?.name).toBe("My Heart");
        expect(input?.is_public).toBe(true);
        expect(input?.repeat_indefinitely).toBe(true);
    });
});

describe("extractDesignUpdateInput", () => {
    it("allows a partial patch that only renames", () => {
        const { input, error } = extractDesignUpdateInput({ name: "renamed" });

        expect(error).toBeUndefined();
        expect(input?.name).toBe("renamed");
        expect(input?.pattern).toBeUndefined();
    });

    it("allows updating pattern alone", () => {
        const { input, error } = extractDesignUpdateInput({ pattern: [0, 1, 2, 3, 4, 0, 0] });

        expect(error).toBeUndefined();
        expect(input?.pattern).toEqual([0, 1, 2, 3, 4, 0, 0]);
    });

    it("rejects an invalid pattern", () => {
        const { error } = extractDesignUpdateInput({ pattern: [0, 1, 2] });
        expect(error).toBeDefined();
    });

    it("rejects a non-boolean is_public", () => {
        const { error } = extractDesignUpdateInput({ is_public: "yes" } as any);
        expect(error).toBeDefined();
    });

    it("no longer accepts scheduling fields - they aren't part of design content", () => {
        const { input } = extractDesignUpdateInput({
            name: "ok",
            start_date: "2026-01-04",
            repeat_indefinitely: true,
        } as any);
        expect((input as any).start_date).toBeUndefined();
        expect((input as any).repeat_indefinitely).toBeUndefined();
    });

    it("ignores mass-assignment fields like user_id/id", () => {
        const { input } = extractDesignUpdateInput({ name: "ok", user_id: "attacker", id: "attacker-id" } as any);
        expect((input as any).user_id).toBeUndefined();
        expect((input as any).id).toBeUndefined();
    });
});

describe("extractDesignSelectionCreateInput", () => {
    it("accepts a minimal valid body", () => {
        const { input, error } = extractDesignSelectionCreateInput({ year: 2026, start_date: "2026-01-04" }, 7);

        expect(error).toBeUndefined();
        expect(input?.start_date).toBe("2026-01-04");
    });

    it("rejects a missing start_date", () => {
        const { error } = extractDesignSelectionCreateInput({ year: 2026 }, 7);
        expect(error).toBeDefined();
    });

    it("rejects a non-Sunday start_date", () => {
        const { error } = extractDesignSelectionCreateInput({ year: 2026, start_date: "2026-01-05" }, 7);
        expect(error).toBeDefined();
    });

    it("validates recurrence_end_date against the given pattern length's derived end_date", () => {
        const { error: tooEarly } = extractDesignSelectionCreateInput(
            { year: 2026, start_date: "2026-01-04", recurrence_end_date: "2026-01-10" },
            7,
        );
        expect(tooEarly).toBeDefined(); // not after end_date (2026-01-10 for a 1-week pattern)

        const { error: ok } = extractDesignSelectionCreateInput(
            { year: 2026, start_date: "2026-01-04", recurrence_end_date: "2027-01-01" },
            7,
        );
        expect(ok).toBeUndefined();
    });

    it("passes through is_active when provided and valid", () => {
        const { input, error } = extractDesignSelectionCreateInput({ year: 2026, start_date: "2026-01-04", is_active: true }, 7);
        expect(error).toBeUndefined();
        expect(input?.is_active).toBe(true);
    });

    it("rejects a non-boolean is_active", () => {
        const { error } = extractDesignSelectionCreateInput({ year: 2026, start_date: "2026-01-04", is_active: "yes" } as any, 7);
        expect(error).toBeDefined();
    });
});

describe("extractDesignSelectionUpdateInput", () => {
    const current: {
        start_date: string;
        year: number;
        custom_range: boolean;
        repeat_indefinitely: boolean;
        recurrence_end_date?: string | null;
    } = {
        start_date: "2026-01-04",
        year: 2026,
        custom_range: false,
        repeat_indefinitely: false,
    };

    it("allows a partial patch that only toggles is_active", () => {
        const { input, error } = extractDesignSelectionUpdateInput({ is_active: true }, current, 7);

        expect(error).toBeUndefined();
        expect(input?.is_active).toBe(true);
        expect(input?.start_date).toBeUndefined();
    });

    it("rejects a non-Sunday start_date", () => {
        const { error } = extractDesignSelectionUpdateInput({ start_date: "2026-01-05" }, current, 7);
        expect(error).toBeDefined();
    });

    it("validates recurrence pairing against the current start_date when only recurrence_end_date changes", () => {
        const { error } = extractDesignSelectionUpdateInput({ recurrence_end_date: "2026-01-10" }, current, 7);
        expect(error).toBeDefined(); // not after derived end_date (2026-01-10) for current.start_date
    });

    it("allows setting a bounded recurrence_end_date against the current start_date", () => {
        const { input, error } = extractDesignSelectionUpdateInput({ recurrence_end_date: "2027-01-01" }, current, 7);
        expect(error).toBeUndefined();
        expect(input?.recurrence_end_date).toBe("2027-01-01");
    });

    it("allows explicitly clearing recurrence_end_date back to null when switching to indefinite", () => {
        const withBoundedRepeat = { ...current, recurrence_end_date: "2027-01-01" };
        const { input, error } = extractDesignSelectionUpdateInput(
            { repeat_indefinitely: true, recurrence_end_date: null },
            withBoundedRepeat,
            7,
        );

        expect(error).toBeUndefined();
        expect(input?.repeat_indefinitely).toBe(true);
        expect(input && "recurrence_end_date" in input).toBe(true);
        expect(input?.recurrence_end_date ?? null).toBeNull();
    });

    it("rejects setting repeat_indefinitely=true while a recurrence_end_date already exists on the current row and isn't cleared", () => {
        const withBoundedRepeat = { ...current, recurrence_end_date: "2027-01-01" };
        const { error } = extractDesignSelectionUpdateInput({ repeat_indefinitely: true }, withBoundedRepeat, 7);
        expect(error).toBeDefined();
    });

    it("recomputes the effective end_date from the new start_date when validating recurrence", () => {
        // moving start_date later pushes end_date later too - a recurrence_end_date
        // that was invalid against the old start_date can become valid against the new one
        const { error } = extractDesignSelectionUpdateInput(
            { start_date: "2026-02-01", recurrence_end_date: "2026-02-10" },
            current,
            7,
        );
        expect(error).toBeUndefined();
    });
});

describe("isValidPastYear", () => {
    const now = new Date("2026-03-01T00:00:00Z");

    it("accepts a year that is already over", () => {
        expect(isValidPastYear(2025, now)).toBe(true);
    });

    it("rejects the current year, future years, and non-integers", () => {
        expect(isValidPastYear(2026, now)).toBe(false);
        expect(isValidPastYear(2030, now)).toBe(false);
        expect(isValidPastYear(2025.5, now)).toBe(false);
        expect(isValidPastYear("2025", now)).toBe(false);
    });
});

describe("validateYearPlacement", () => {
    it("accepts a start in the year's first column, even when that Sunday is in December of the year before", () => {
        // Jan 1 2025 is a Wednesday - 2025's grid starts Sun 2024-12-29
        expect(validateYearPlacement(2025, "2024-12-29", 7)).toBeUndefined();
    });

    it("accepts the same shared Sunday as the *previous* year's last column", () => {
        // Sun 2025-12-28 starts both 2025's last column and 2026's first column -
        // the stored year, not the date, says which is meant
        expect(validateYearPlacement(2025, "2025-12-28", 7)).toBeUndefined();
        expect(validateYearPlacement(2026, "2025-12-28", 7)).toBeUndefined();
    });

    it("rejects a start before the year's grid or after Dec 31", () => {
        expect(validateYearPlacement(2025, "2024-12-22", 7)).toBeDefined();
        expect(validateYearPlacement(2025, "2026-01-04", 7)).toBeDefined();
    });

    it("rejects a pattern that runs past the year's last column", () => {
        // 2025 has 53 columns; a 2-week pattern starting in the last one overflows
        expect(validateYearPlacement(2025, "2025-12-28", 14)).toBeDefined();
        // the full 53 columns from the first one fits exactly
        expect(validateYearPlacement(2025, "2024-12-29", 53 * 7)).toBeUndefined();
        expect(validateYearPlacement(2025, "2024-12-29", 54 * 7)).toBeDefined();
    });

    it("allows the 54th column in a leap year starting on a Saturday", () => {
        // 2028 starts on a Saturday - its grid needs 54 columns to reach Dec 31
        expect(validateYearPlacement(2028, "2027-12-26", 54 * 7)).toBeUndefined();
        expect(validateYearPlacement(2028, "2028-12-31", 7)).toBeUndefined();
    });
});

describe("validateCustomRangePairing", () => {
    it("allows custom_range on its own", () => {
        expect(validateCustomRangePairing(true, false, null)).toBeUndefined();
    });

    it("rejects custom_range combined with either reserved recurrence field", () => {
        expect(validateCustomRangePairing(true, true, null)).toBeDefined();
        expect(validateCustomRangePairing(true, false, "2026-12-31")).toBeDefined();
    });
});

describe("year + custom_range on create/select/update", () => {
    const body = { start_date: "2026-03-01", year: 2026, pattern: new Array(14).fill(1) };

    it("requires a year on create", () => {
        const { year, ...withoutYear } = body;
        expect(year).toBe(2026);
        expect(extractDesignCreateInput(withoutYear).error).toMatch(/year/);
        expect(extractDesignSelectionCreateInput({ start_date: body.start_date }, 14).error).toMatch(/year/);
    });

    it("rejects a year that isn't over yet", () => {
        expect(extractDesignCreateInput({ ...body, year: 2027, start_date: "2027-03-07" }).error).toMatch(/year/);
    });

    it("defaults custom_range to false and passes it through when set", () => {
        expect(extractDesignCreateInput(body).input?.custom_range).toBe(false);
        expect(extractDesignCreateInput({ ...body, custom_range: true }).input?.custom_range).toBe(true);
        expect(extractDesignSelectionCreateInput({ start_date: body.start_date, year: 2026 }, 14).input?.custom_range).toBe(false);
    });

    it("rejects a non-boolean custom_range", () => {
        expect(extractDesignCreateInput({ ...body, custom_range: "yes" }).error).toMatch(/custom_range/);
    });

    it("rejects a start_date outside the given year's grid", () => {
        expect(extractDesignCreateInput({ ...body, start_date: "2025-06-01" }).error).toMatch(/grid/);
    });

    it("accepts a custom range ending in the year's last column", () => {
        // 2026's grid: Sun 2025-12-28 .. 53 columns; a 2-week range in the last two
        const { error, input } = extractDesignCreateInput({ ...body, start_date: "2026-12-20", custom_range: true });
        expect(error).toBeUndefined();
        expect(input?.custom_range).toBe(true);
    });

    it("re-checks placement against the effective year when only the year changes on update", () => {
        const current = { start_date: "2026-03-01", year: 2026, custom_range: false, repeat_indefinitely: false };
        // start_date stays in 2026, so moving the year alone leaves it outside 2025's grid
        expect(extractDesignSelectionUpdateInput({ year: 2025 }, current, 14).error).toMatch(/grid/);
        expect(extractDesignSelectionUpdateInput({ year: 2025, start_date: "2025-03-02" }, current, 14).error).toBeUndefined();
    });

    it("lets update toggle custom_range, but not alongside a reserved recurrence field", () => {
        const current = { start_date: "2026-03-01", year: 2026, custom_range: false, repeat_indefinitely: false };
        expect(extractDesignSelectionUpdateInput({ custom_range: true }, current, 14).input?.custom_range).toBe(true);
        expect(
            extractDesignSelectionUpdateInput({ custom_range: true, recurrence_end_date: "2026-12-31" }, current, 14).error,
        ).toMatch(/custom_range/);
    });
});

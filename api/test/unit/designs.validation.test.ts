import {
    MAX_PATTERN_LENGTH,
    isValidPattern,
    isValidDateString,
    isSunday,
    computeEndDate,
    validateRecurrencePairing,
    extractDesignCreateInput,
    extractDesignUpdateInput,
} from "../../services/designs.validation";
import { iDesign } from "../../models/designs";

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
        pattern: [0, 1, 2, 3, 4, 0, 0],
    };

    it("accepts a minimal valid body and computes end_date", () => {
        const { input, error } = extractDesignCreateInput(validBody);

        expect(error).toBeUndefined();
        expect(input?.start_date).toBe("2026-01-04");
        expect(input?.end_date).toBe("2026-01-10");
        expect(input?.pattern).toEqual(validBody.pattern);
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
    const current: iDesign = {
        id: "d1" as any,
        user_id: "u1" as any,
        name: "original" as any,
        is_public: false as any,
        start_date: "2026-01-04" as any,
        end_date: "2026-01-10" as any,
        pattern: [0, 1, 2, 3, 4, 0, 0] as any,
        repeat_indefinitely: false as any,
    };

    it("allows a partial patch that only renames, leaving end_date untouched", () => {
        const { input, error } = extractDesignUpdateInput({ name: "renamed" }, current);

        expect(error).toBeUndefined();
        expect(input?.name).toBe("renamed");
        expect(input?.end_date).toBeUndefined();
        expect(input?.start_date).toBeUndefined();
    });

    it("recomputes end_date when pattern changes, using the current start_date", () => {
        const { input, error } = extractDesignUpdateInput({ pattern: [0, 1, 2, 3, 4, 0, 0, 1, 1, 1, 1, 1, 1, 1] }, current);

        expect(error).toBeUndefined();
        expect(input?.end_date).toBe("2026-01-17");
    });

    it("recomputes end_date when start_date changes, using the current pattern length", () => {
        const { input, error } = extractDesignUpdateInput({ start_date: "2026-02-01" }, current);

        expect(error).toBeUndefined();
        expect(input?.end_date).toBe("2026-02-07");
    });

    it("rejects a non-Sunday start_date", () => {
        const { error } = extractDesignUpdateInput({ start_date: "2026-02-02" }, current);
        expect(error).toBeDefined();
    });

    it("validates recurrence pairing against the current end_date when only recurrence_end_date changes", () => {
        const { error } = extractDesignUpdateInput({ recurrence_end_date: "2026-01-10" }, current);
        expect(error).toBeDefined(); // not after current.end_date (2026-01-10)
    });

    it("allows setting a bounded recurrence_end_date against the current end_date", () => {
        const { input, error } = extractDesignUpdateInput({ recurrence_end_date: "2027-01-01" }, current);
        expect(error).toBeUndefined();
        expect(input?.recurrence_end_date).toBe("2027-01-01");
    });

    it("allows explicitly clearing recurrence_end_date back to null when switching to indefinite", () => {
        const withBoundedRepeat: iDesign = { ...current, recurrence_end_date: "2027-01-01" as any };
        const { input, error } = extractDesignUpdateInput(
            { repeat_indefinitely: true, recurrence_end_date: null },
            withBoundedRepeat,
        );

        expect(error).toBeUndefined();
        expect(input?.repeat_indefinitely).toBe(true);
        expect(input && "recurrence_end_date" in input).toBe(true);
        expect(input?.recurrence_end_date ?? null).toBeNull();
    });

    it("rejects setting repeat_indefinitely=true while a recurrence_end_date already exists on the current row and isn't cleared", () => {
        const withBoundedRepeat: iDesign = { ...current, recurrence_end_date: "2027-01-01" as any };
        const { error } = extractDesignUpdateInput({ repeat_indefinitely: true }, withBoundedRepeat);
        expect(error).toBeDefined();
    });

    it("ignores mass-assignment fields like user_id/id", () => {
        const { input } = extractDesignUpdateInput({ name: "ok", user_id: "attacker", id: "attacker-id" } as any, current);
        expect((input as any).user_id).toBeUndefined();
        expect((input as any).id).toBeUndefined();
    });
});

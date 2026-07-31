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
} from "../../services/designs.validation";

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
        const { input, error } = extractDesignSelectionCreateInput({ start_date: "2026-01-04" }, 7);

        expect(error).toBeUndefined();
        expect(input?.start_date).toBe("2026-01-04");
    });

    it("rejects a missing start_date", () => {
        const { error } = extractDesignSelectionCreateInput({}, 7);
        expect(error).toBeDefined();
    });

    it("rejects a non-Sunday start_date", () => {
        const { error } = extractDesignSelectionCreateInput({ start_date: "2026-01-05" }, 7);
        expect(error).toBeDefined();
    });

    it("validates recurrence_end_date against the given pattern length's derived end_date", () => {
        const { error: tooEarly } = extractDesignSelectionCreateInput(
            { start_date: "2026-01-04", recurrence_end_date: "2026-01-10" },
            7,
        );
        expect(tooEarly).toBeDefined(); // not after end_date (2026-01-10 for a 1-week pattern)

        const { error: ok } = extractDesignSelectionCreateInput(
            { start_date: "2026-01-04", recurrence_end_date: "2027-01-01" },
            7,
        );
        expect(ok).toBeUndefined();
    });

    it("passes through is_active when provided and valid", () => {
        const { input, error } = extractDesignSelectionCreateInput({ start_date: "2026-01-04", is_active: true }, 7);
        expect(error).toBeUndefined();
        expect(input?.is_active).toBe(true);
    });

    it("rejects a non-boolean is_active", () => {
        const { error } = extractDesignSelectionCreateInput({ start_date: "2026-01-04", is_active: "yes" } as any, 7);
        expect(error).toBeDefined();
    });
});

describe("extractDesignSelectionUpdateInput", () => {
    const current: { start_date: string; repeat_indefinitely: boolean; recurrence_end_date?: string | null } = {
        start_date: "2026-01-04",
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

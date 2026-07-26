import { iDesign, iDesignCreateInput, iDesignUpdateInput } from "../models/designs";

// 10 years worth of weeks (520 weeks * 7 days) - a generous ceiling that still
// blocks a pathologically large array from being persisted.
export const MAX_PATTERN_LENGTH = 3640;

export function isValidPattern(value: unknown): value is number[] {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.length % 7 === 0 &&
        value.length <= MAX_PATTERN_LENGTH &&
        value.every((v) => Number.isInteger(v) && v >= 0 && v <= 4)
    );
}

export function isValidDateString(value: unknown): value is string {
    if (typeof value !== "string") return false;
    return !isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function isSunday(dateStr: string): boolean {
    return new Date(`${dateStr}T00:00:00Z`).getUTCDay() === 0;
}

export function computeEndDate(startDate: string, patternLength: number): string {
    const weeks = patternLength / 7;
    const end = new Date(`${startDate}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + weeks * 7 - 1);
    return end.toISOString().slice(0, 10);
}

/**
 * Enforces the same rule as the designs_recurrence_end_date_consistency DB
 * CHECK: recurrence_end_date must be null when repeat_indefinitely is true;
 * when set, it must be after end_date. Both false/null together is valid -
 * that's a one-off design that doesn't repeat at all.
 */
export function validateRecurrencePairing(
    repeatIndefinitely: boolean,
    recurrenceEndDate: string | null | undefined,
    endDate: string,
): string | undefined {
    if (repeatIndefinitely) {
        if (recurrenceEndDate) {
            return "recurrence_end_date must not be set when repeat_indefinitely is true.";
        }
        return undefined;
    }
    if (recurrenceEndDate != null && !(recurrenceEndDate > endDate)) {
        return "recurrence_end_date must be after end_date.";
    }
    return undefined;
}

/**
 * Allow-lists and validates a POST /design body. Only the fields named here
 * are ever read from the body, so extra fields (id, user_id, timestamps)
 * can't be mass-assigned. end_date is always derived from start_date +
 * pattern length, never taken from the client.
 */
export function extractDesignCreateInput(
    body: Record<string, unknown>,
): { input?: iDesignCreateInput; error?: string } {
    if (!isValidDateString(body.start_date)) {
        return { error: "start_date is required and must be a valid date." };
    }
    if (!isSunday(body.start_date)) {
        return { error: "start_date must be a Sunday." };
    }
    if (!isValidPattern(body.pattern)) {
        return {
            error: `pattern is required and must be a non-empty array of integers 0-4 whose length is a multiple of 7 (max ${MAX_PATTERN_LENGTH}).`,
        };
    }
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 255)) {
        return { error: "name must be a string of 255 characters or fewer." };
    }
    if (body.is_public !== undefined && typeof body.is_public !== "boolean") {
        return { error: "is_public must be a boolean." };
    }
    if (body.repeat_indefinitely !== undefined && typeof body.repeat_indefinitely !== "boolean") {
        return { error: "repeat_indefinitely must be a boolean." };
    }
    if (
        body.recurrence_end_date !== undefined &&
        body.recurrence_end_date !== null &&
        !isValidDateString(body.recurrence_end_date)
    ) {
        return { error: "recurrence_end_date must be a valid date or null." };
    }

    const startDate = body.start_date;
    const pattern = body.pattern;
    const repeatIndefinitely = (body.repeat_indefinitely as boolean | undefined) ?? false;
    const recurrenceEndDate = body.recurrence_end_date as string | null | undefined;
    const endDate = computeEndDate(startDate, pattern.length);

    const recurrenceError = validateRecurrencePairing(repeatIndefinitely, recurrenceEndDate, endDate);
    if (recurrenceError) return { error: recurrenceError };

    const input: any = {
        start_date: startDate,
        end_date: endDate,
        pattern,
    };
    if (body.name !== undefined) input.name = body.name;
    if (body.is_public !== undefined) input.is_public = body.is_public;
    if (body.repeat_indefinitely !== undefined) input.repeat_indefinitely = repeatIndefinitely;
    if (body.recurrence_end_date !== undefined) input.recurrence_end_date = recurrenceEndDate;

    return { input };
}

/**
 * Allow-lists and validates a PATCH /design/:designId body against the
 * design's current row (needed so a partial patch that only touches one
 * side of the repeat_indefinitely/recurrence_end_date pair, or leaves
 * start_date/pattern untouched, can still be validated against the
 * design's *effective* end_date and recurrence state).
 */
export function extractDesignUpdateInput(
    body: Record<string, unknown>,
    current: iDesign,
): { input?: iDesignUpdateInput; error?: string } {
    const input: any = {};

    if ("name" in body) {
        if (typeof body.name !== "string" || body.name.length > 255) {
            return { error: "name must be a string of 255 characters or fewer." };
        }
        input.name = body.name;
    }

    if ("is_public" in body) {
        if (typeof body.is_public !== "boolean") {
            return { error: "is_public must be a boolean." };
        }
        input.is_public = body.is_public;
    }

    if ("start_date" in body) {
        if (!isValidDateString(body.start_date)) {
            return { error: "start_date must be a valid date." };
        }
        if (!isSunday(body.start_date)) {
            return { error: "start_date must be a Sunday." };
        }
        input.start_date = body.start_date;
    }

    if ("pattern" in body) {
        if (!isValidPattern(body.pattern)) {
            return {
                error: `pattern must be a non-empty array of integers 0-4 whose length is a multiple of 7 (max ${MAX_PATTERN_LENGTH}).`,
            };
        }
        input.pattern = body.pattern;
    }

    if ("repeat_indefinitely" in body) {
        if (typeof body.repeat_indefinitely !== "boolean") {
            return { error: "repeat_indefinitely must be a boolean." };
        }
        input.repeat_indefinitely = body.repeat_indefinitely;
    }

    if ("recurrence_end_date" in body) {
        if (body.recurrence_end_date !== null && !isValidDateString(body.recurrence_end_date)) {
            return { error: "recurrence_end_date must be a valid date or null." };
        }
        input.recurrence_end_date = body.recurrence_end_date;
    }

    const startDateOrPatternChanged = "start_date" in input || "pattern" in input;
    const nextStartDate: string = input.start_date ?? (current.start_date as unknown as string);
    const nextPatternLength: number = input.pattern
        ? input.pattern.length
        : (current.pattern as unknown as number[]).length;
    const endDate: string = startDateOrPatternChanged
        ? computeEndDate(nextStartDate, nextPatternLength)
        : (current.end_date as unknown as string);

    const recurrenceTouched = "repeat_indefinitely" in input || "recurrence_end_date" in input || startDateOrPatternChanged;
    if (recurrenceTouched) {
        const nextRepeatIndefinitely: boolean =
            input.repeat_indefinitely !== undefined
                ? input.repeat_indefinitely
                : (current.repeat_indefinitely as unknown as boolean);
        const nextRecurrenceEndDate: string | null | undefined =
            "recurrence_end_date" in input ? input.recurrence_end_date : (current.recurrence_end_date as unknown as string | undefined);

        const recurrenceError = validateRecurrencePairing(nextRepeatIndefinitely, nextRecurrenceEndDate ?? null, endDate);
        if (recurrenceError) return { error: recurrenceError };
    }

    if (startDateOrPatternChanged) {
        input.end_date = endDate;
    }

    return { input };
}

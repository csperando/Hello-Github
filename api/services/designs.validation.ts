import {
    iDesignCreateInput,
    iDesignUpdateInput,
    iDesignSelectionCreateInput,
    iDesignSelectionUpdateInput,
} from "../models/designs";
import { yearGridStart, yearGridWeeks } from "./designs.schedule";

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

/** A whole past calendar year - designs paint years that are already over. */
export function isValidPastYear(value: unknown, now: Date = new Date()): value is number {
    return Number.isInteger(value) && (value as number) < now.getUTCFullYear();
}

/**
 * The pattern must sit entirely inside `year`'s grid: start_date's column no
 * earlier than the Sunday on/before Jan 1 (the
 * design_selections_start_date_in_year DB CHECK), and its last column no later
 * than the week holding Dec 31.
 */
export function validateYearPlacement(year: number, startDate: string, patternLength: number): string | undefined {
    const gridStart = yearGridStart(year);
    if (startDate < gridStart || startDate > `${year}-12-31`) {
        return `start_date must fall within ${year}'s grid (${gridStart} to ${year}-12-31).`;
    }
    const startWeek = Math.round(
        (new Date(`${startDate}T00:00:00Z`).getTime() - new Date(`${gridStart}T00:00:00Z`).getTime()) / (7 * 86400000),
    );
    if (startWeek + patternLength / 7 > yearGridWeeks(year)) {
        return `pattern runs past the end of ${year}'s grid.`;
    }
    return undefined;
}

/**
 * custom_range is its own repeat mode - tiling through Dec 31 of the year -
 * so it can't be combined with the (separate, unimplemented) recurrence
 * fields.
 */
export function validateCustomRangePairing(
    customRange: boolean,
    repeatIndefinitely: boolean,
    recurrenceEndDate: string | null | undefined,
): string | undefined {
    if (customRange && (repeatIndefinitely || recurrenceEndDate != null)) {
        return "custom_range cannot be combined with repeat_indefinitely or recurrence_end_date.";
    }
    return undefined;
}

/**
 * Enforces the same rule as the design_selections_recurrence_end_date_consistency
 * DB CHECK: recurrence_end_date must be null when repeat_indefinitely is
 * true; when set, it must be after the pattern's (derived) end_date. Both
 * false/null together is valid - that's a one-off selection that doesn't
 * repeat at all.
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
 * Allow-lists and validates a POST /design body: design content plus the
 * creator's own initial selection, since a design is never created
 * pivot-less. Only the fields named here are ever read from the body, so
 * extra fields (id, user_id, timestamps) can't be mass-assigned.
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
    if (!isValidPastYear(body.year)) {
        return { error: "year is required and must be a past calendar year." };
    }
    if (body.custom_range !== undefined && typeof body.custom_range !== "boolean") {
        return { error: "custom_range must be a boolean." };
    }

    const startDate = body.start_date;
    const pattern = body.pattern;
    const year = body.year;
    const customRange = (body.custom_range as boolean | undefined) ?? false;
    const repeatIndefinitely = (body.repeat_indefinitely as boolean | undefined) ?? false;
    const recurrenceEndDate = body.recurrence_end_date as string | null | undefined;
    const endDate = computeEndDate(startDate, pattern.length);

    const placementError = validateYearPlacement(year, startDate, pattern.length);
    if (placementError) return { error: placementError };

    const customRangeError = validateCustomRangePairing(customRange, repeatIndefinitely, recurrenceEndDate);
    if (customRangeError) return { error: customRangeError };

    const recurrenceError = validateRecurrencePairing(repeatIndefinitely, recurrenceEndDate, endDate);
    if (recurrenceError) return { error: recurrenceError };

    const input: any = {
        start_date: startDate,
        pattern,
        year,
        custom_range: customRange,
    };
    if (body.name !== undefined) input.name = body.name;
    if (body.is_public !== undefined) input.is_public = body.is_public;
    if (body.repeat_indefinitely !== undefined) input.repeat_indefinitely = repeatIndefinitely;
    if (body.recurrence_end_date !== undefined) input.recurrence_end_date = recurrenceEndDate;

    return { input };
}

/**
 * Allow-lists and validates a PATCH /design/:designId body. Content only -
 * name/is_public/pattern - since scheduling now lives on the selection, not
 * the design. No mass-assignment of id/user_id/timestamps.
 */
export function extractDesignUpdateInput(
    body: Record<string, unknown>,
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

    if ("pattern" in body) {
        if (!isValidPattern(body.pattern)) {
            return {
                error: `pattern must be a non-empty array of integers 0-4 whose length is a multiple of 7 (max ${MAX_PATTERN_LENGTH}).`,
            };
        }
        input.pattern = body.pattern;
    }

    return { input };
}

/**
 * Allow-lists and validates a POST /design/:designId/select body (a user
 * selecting a design - their own new one, or an existing public one - for
 * the first time). patternLength comes from the target design, since
 * recurrence_end_date is validated against the pattern's derived end_date.
 */
export function extractDesignSelectionCreateInput(
    body: Record<string, unknown>,
    patternLength: number,
): { input?: iDesignSelectionCreateInput; error?: string } {
    if (!isValidDateString(body.start_date)) {
        return { error: "start_date is required and must be a valid date." };
    }
    if (!isSunday(body.start_date)) {
        return { error: "start_date must be a Sunday." };
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
    if (body.is_active !== undefined && typeof body.is_active !== "boolean") {
        return { error: "is_active must be a boolean." };
    }
    if (!isValidPastYear(body.year)) {
        return { error: "year is required and must be a past calendar year." };
    }
    if (body.custom_range !== undefined && typeof body.custom_range !== "boolean") {
        return { error: "custom_range must be a boolean." };
    }

    const startDate = body.start_date;
    const year = body.year;
    const customRange = (body.custom_range as boolean | undefined) ?? false;
    const repeatIndefinitely = (body.repeat_indefinitely as boolean | undefined) ?? false;
    const recurrenceEndDate = body.recurrence_end_date as string | null | undefined;
    const endDate = computeEndDate(startDate, patternLength);

    const placementError = validateYearPlacement(year, startDate, patternLength);
    if (placementError) return { error: placementError };

    const customRangeError = validateCustomRangePairing(customRange, repeatIndefinitely, recurrenceEndDate);
    if (customRangeError) return { error: customRangeError };

    const recurrenceError = validateRecurrencePairing(repeatIndefinitely, recurrenceEndDate, endDate);
    if (recurrenceError) return { error: recurrenceError };

    const input: any = { start_date: startDate, year, custom_range: customRange };
    if (body.repeat_indefinitely !== undefined) input.repeat_indefinitely = repeatIndefinitely;
    if (body.recurrence_end_date !== undefined) input.recurrence_end_date = recurrenceEndDate;
    if (body.is_active !== undefined) input.is_active = body.is_active;

    return { input };
}

/**
 * Allow-lists and validates a PATCH /design/:designId/select body against
 * the requesting user's current selection row, needed so a partial patch
 * (e.g. only toggling is_active) can still be validated against the
 * selection's *effective* recurrence state. patternLength comes from the
 * design the selection points at (fixed - not editable via the selection).
 */
export function extractDesignSelectionUpdateInput(
    body: Record<string, unknown>,
    current: {
        start_date: string;
        year: number;
        custom_range: boolean;
        repeat_indefinitely: boolean;
        recurrence_end_date?: string | null;
    },
    patternLength: number,
): { input?: iDesignSelectionUpdateInput; error?: string } {
    const input: any = {};

    if ("start_date" in body) {
        if (!isValidDateString(body.start_date)) {
            return { error: "start_date must be a valid date." };
        }
        if (!isSunday(body.start_date)) {
            return { error: "start_date must be a Sunday." };
        }
        input.start_date = body.start_date;
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

    if ("is_active" in body) {
        if (typeof body.is_active !== "boolean") {
            return { error: "is_active must be a boolean." };
        }
        input.is_active = body.is_active;
    }

    if ("year" in body) {
        if (!isValidPastYear(body.year)) {
            return { error: "year must be a past calendar year." };
        }
        input.year = body.year;
    }

    if ("custom_range" in body) {
        if (typeof body.custom_range !== "boolean") {
            return { error: "custom_range must be a boolean." };
        }
        input.custom_range = body.custom_range;
    }

    // Placement is re-checked whenever where/which year it paints changes -
    // against the *effective* year + start_date, since a year change moves
    // the grid out from under an unchanged start_date.
    if ("year" in input || "start_date" in input) {
        const placementError = validateYearPlacement(input.year ?? current.year, input.start_date ?? current.start_date, patternLength);
        if (placementError) return { error: placementError };
    }

    const startDateChanged = "start_date" in input;
    const nextStartDate: string = input.start_date ?? current.start_date;
    const endDate = computeEndDate(nextStartDate, patternLength);
    const nextCustomRange: boolean = input.custom_range ?? current.custom_range;
    const nextRepeatIndefinitely: boolean = input.repeat_indefinitely ?? current.repeat_indefinitely;
    const nextRecurrenceEndDate: string | null | undefined =
        "recurrence_end_date" in input ? input.recurrence_end_date : current.recurrence_end_date;

    const customRangeError = validateCustomRangePairing(nextCustomRange, nextRepeatIndefinitely, nextRecurrenceEndDate);
    if (customRangeError) return { error: customRangeError };

    const recurrenceTouched = "repeat_indefinitely" in input || "recurrence_end_date" in input || startDateChanged;
    if (recurrenceTouched) {
        const recurrenceError = validateRecurrencePairing(nextRepeatIndefinitely, nextRecurrenceEndDate ?? null, endDate);
        if (recurrenceError) return { error: recurrenceError };
    }

    return { input };
}

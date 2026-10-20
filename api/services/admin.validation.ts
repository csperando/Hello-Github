import { ADMIN_JOB_FILTERS, iAdminJobFilter } from "../models/backfillJobs";
import type { iAdminPaymentFilters, iRefundInput, iRefundState } from "../repository/payments.repo";
import { isValidDateString } from "./designs.validation";

const REFUND_STATES: iRefundState[] = ["paid", "partially_refunded", "refunded"];
const MAX_SEARCH_LENGTH = 100;
const MAX_NOTE_LENGTH = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed uuid - checked before it reaches a uuid column, so a bad id is a 404, not a DB error. */
export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_RE.test(value);
}

function optionalSearch(value: unknown): { search?: string; error?: string } {
    if (value === undefined || value === "") return {};
    if (typeof value !== "string" || value.trim().length > MAX_SEARCH_LENGTH) {
        return { error: `search must be text of ${MAX_SEARCH_LENGTH} characters or fewer.` };
    }
    const search = value.trim();
    return search ? { search } : {};
}

/** GET /admin/payments query: search, status (refund state) and since (a date), all optional. */
export function extractAdminPaymentFilters(query: Record<string, unknown>): { input?: iAdminPaymentFilters; error?: string } {
    const { search, error } = optionalSearch(query.search);
    if (error) return { error };

    const input: iAdminPaymentFilters = {};
    if (search) input.search = search;

    if (query.status !== undefined && query.status !== "") {
        if (typeof query.status !== "string" || !(REFUND_STATES as string[]).includes(query.status)) {
            return { error: `status must be one of ${REFUND_STATES.join(", ")}.` };
        }
        input.refundState = query.status as iRefundState;
    }

    if (query.since !== undefined && query.since !== "") {
        if (!isValidDateString(query.since)) return { error: "since must be a date (YYYY-MM-DD)." };
        input.since = query.since;
    }

    return { input };
}

/**
 * PATCH /admin/payments/:id body - records a refund already made in Stripe.
 * amount_refunded_cents is required (0 clears a refund recorded by mistake,
 * along with its date and Stripe id); a refund needs the date it was made.
 */
export function extractRefundInput(
    body: Record<string, unknown>,
    amountTotalCents: number,
): { input?: iRefundInput; error?: string } {
    const amount = body.amount_refunded_cents;
    if (!Number.isInteger(amount) || (amount as number) < 0 || (amount as number) > amountTotalCents) {
        return { error: `amount_refunded_cents must be a whole number of cents from 0 to ${amountTotalCents}.` };
    }

    const note = body.admin_note;
    if (note !== undefined && note !== null && (typeof note !== "string" || note.length > MAX_NOTE_LENGTH)) {
        return { error: `admin_note must be text of ${MAX_NOTE_LENGTH} characters or fewer.` };
    }
    const adminNote = typeof note === "string" && note.trim() ? note.trim() : null;

    if (amount === 0) {
        return { input: { amount_refunded_cents: 0, refunded_at: null, stripe_refund_id: null, admin_note: adminNote } };
    }

    if (!isValidDateString(body.refunded_at)) {
        return { error: "refunded_at is required for a refund and must be a date (YYYY-MM-DD)." };
    }

    const refundId = body.stripe_refund_id;
    if (refundId !== undefined && refundId !== null && (typeof refundId !== "string" || refundId.length > 255)) {
        return { error: "stripe_refund_id must be text of 255 characters or fewer." };
    }

    return {
        input: {
            amount_refunded_cents: amount as number,
            refunded_at: body.refunded_at,
            stripe_refund_id: typeof refundId === "string" && refundId.trim() ? refundId.trim() : null,
            admin_note: adminNote,
        },
    };
}

/** GET /admin/jobs query: an optional filter (absent or "all" = every job). */
export function extractJobFilter(query: Record<string, unknown>): { filter?: iAdminJobFilter | null; error?: string } {
    const filter = query.filter;
    if (filter === undefined || filter === "" || filter === "all") return { filter: null };
    if (typeof filter !== "string" || !Object.keys(ADMIN_JOB_FILTERS).includes(filter)) {
        return { error: `filter must be one of all, ${Object.keys(ADMIN_JOB_FILTERS).join(", ")}.` };
    }
    return { filter: filter as iAdminJobFilter };
}

/** GET /admin/users query: an optional search. */
export function extractUserSearch(query: Record<string, unknown>): { search?: string | null; error?: string } {
    const { search, error } = optionalSearch(query.search);
    if (error) return { error };
    return { search: search ?? null };
}

export interface iAdminUserUpdate {
    display_name?: string;
    role?: "user" | "admin";
    is_active?: boolean;
    default_charity?: number;
}

/**
 * PATCH /admin/users/:id body - only these fields, at least one of them.
 * `isSelf`: an admin can't take away their own admin access.
 */
export function extractAdminUserUpdate(
    body: Record<string, unknown>,
    isSelf: boolean,
): { input?: iAdminUserUpdate; error?: string } {
    const input: iAdminUserUpdate = {};

    if ("display_name" in body) {
        if (typeof body.display_name !== "string" || !body.display_name.trim() || body.display_name.length > 255) {
            return { error: "display_name must be non-empty text of 255 characters or fewer." };
        }
        input.display_name = body.display_name.trim();
    }
    if ("role" in body) {
        if (body.role !== "user" && body.role !== "admin") return { error: "role must be user or admin." };
        input.role = body.role;
    }
    if ("is_active" in body) {
        if (typeof body.is_active !== "boolean") return { error: "is_active must be a boolean." };
        input.is_active = body.is_active;
    }
    if ("default_charity" in body) {
        if (!Number.isInteger(body.default_charity) || (body.default_charity as number) <= 0) {
            return { error: "default_charity must be a charity id." };
        }
        input.default_charity = body.default_charity as number;
    }

    if (Object.keys(input).length === 0) {
        return { error: "Nothing to update - send display_name, role, is_active or default_charity." };
    }
    if (isSelf && (input.role === "user" || input.is_active === false)) {
        return { error: "You can't remove your own admin access or turn off your own account." };
    }

    return { input };
}

import { iCompletionReport } from "./scheduler.service";

const VALID_STATUSES = ["committed", "failed"] as const;

/**
 * Allow-lists and validates a POST /scheduler/due/complete body - an array
 * of per-user outcomes for the current run. Only the fields named here are
 * ever read, so extra fields can't be mass-assigned onto the run_log insert.
 */
export function extractCompletionReports(body: unknown): { input?: iCompletionReport[]; error?: string } {
    if (!Array.isArray(body)) {
        return { error: "Request body must be an array of completion reports." };
    }

    const input: iCompletionReport[] = [];

    for (let i = 0; i < body.length; i++) {
        const entry = body[i];

        if (typeof entry !== "object" || entry === null) {
            return { error: `Entry ${i} must be an object.` };
        }
        const e = entry as Record<string, unknown>;

        if (typeof e.user_id !== "string" || e.user_id.length === 0) {
            return { error: `Entry ${i}: user_id must be a non-empty string.` };
        }
        if (typeof e.target_date !== "string" || isNaN(new Date(`${e.target_date}T00:00:00Z`).getTime())) {
            return { error: `Entry ${i}: target_date must be a valid date string.` };
        }
        if (!Number.isInteger(e.commit_count) || (e.commit_count as number) < 0) {
            return { error: `Entry ${i}: commit_count must be a non-negative integer.` };
        }
        if (typeof e.status !== "string" || !(VALID_STATUSES as readonly string[]).includes(e.status)) {
            return { error: `Entry ${i}: status must be one of ${VALID_STATUSES.join(", ")}.` };
        }

        input.push({
            user_id: e.user_id,
            target_date: e.target_date,
            commit_count: e.commit_count as number,
            status: e.status as iCompletionReport["status"],
        });
    }

    return { input };
}

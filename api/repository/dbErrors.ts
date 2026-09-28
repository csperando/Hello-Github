// unique_violation - see design_selections' constraints (0004_create_design_selections.sql)
// and designs.routes.ts's own local copy of this same code, kept separate
// there rather than refactored onto this shared helper as part of this fix.
export const PG_UNIQUE_VIOLATION = "23505";

/**
 * True when `err` is a Postgres unique-violation on exactly `constraintName`.
 * Lets a caller tell "lost the race to this specific UNIQUE constraint"
 * (an expected, recoverable outcome) apart from any other unexpected DB
 * failure, without string-matching the error message.
 */
export function isUniqueViolationOn(err: unknown, constraintName: string): boolean {
    if (typeof err !== "object" || err === null) return false;
    const { code, constraint } = err as { code?: unknown; constraint?: unknown };
    return code === PG_UNIQUE_VIOLATION && constraint === constraintName;
}

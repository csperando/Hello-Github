import {
    isUuid,
    extractAdminPaymentFilters,
    extractRefundInput,
    extractJobFilter,
    extractUserSearch,
    extractAdminUserUpdate,
} from "../../services/admin.validation";

describe("isUuid", () => {
    it("accepts a uuid and nothing else", () => {
        expect(isUuid("3f1c2b9e-8d4a-4c7e-9b1a-2e5f6a7b8c9d")).toBe(true);
        expect(isUuid("3f1c2b9e")).toBe(false);
        expect(isUuid("'; DROP TABLE payments; --")).toBe(false);
        expect(isUuid(undefined)).toBe(false);
    });
});

describe("extractAdminPaymentFilters", () => {
    it("treats every filter as optional", () => {
        expect(extractAdminPaymentFilters({})).toEqual({ input: {} });
        expect(extractAdminPaymentFilters({ search: "", status: "", since: "" })).toEqual({ input: {} });
    });

    it("trims the search and maps status to a refund state", () => {
        expect(extractAdminPaymentFilters({ search: "  octo ", status: "partially_refunded", since: "2026-10-01" })).toEqual({
            input: { search: "octo", refundState: "partially_refunded", since: "2026-10-01" },
        });
    });

    it("rejects an unknown status, a bad date, or an overlong search", () => {
        expect(extractAdminPaymentFilters({ status: "succeeded" }).error).toMatch(/status/);
        expect(extractAdminPaymentFilters({ since: "yesterday" }).error).toMatch(/since/);
        expect(extractAdminPaymentFilters({ search: "x".repeat(101) }).error).toMatch(/search/);
    });
});

describe("extractRefundInput", () => {
    const TOTAL = 2500;

    it("records a full or partial refund, with its date, Stripe id and note", () => {
        expect(
            extractRefundInput(
                { amount_refunded_cents: 2500, refunded_at: "2026-10-20", stripe_refund_id: " re_123 ", admin_note: " duplicate " },
                TOTAL,
            ),
        ).toEqual({
            input: { amount_refunded_cents: 2500, refunded_at: "2026-10-20", stripe_refund_id: "re_123", admin_note: "duplicate" },
        });
        expect(extractRefundInput({ amount_refunded_cents: 1000, refunded_at: "2026-10-20" }, TOTAL).input?.amount_refunded_cents).toBe(1000);
    });

    it("never accepts more than was charged, a negative amount, or fractions of a cent", () => {
        expect(extractRefundInput({ amount_refunded_cents: 2501, refunded_at: "2026-10-20" }, TOTAL).error).toMatch(/0 to 2500/);
        expect(extractRefundInput({ amount_refunded_cents: -1, refunded_at: "2026-10-20" }, TOTAL).error).toBeDefined();
        expect(extractRefundInput({ amount_refunded_cents: 10.5, refunded_at: "2026-10-20" }, TOTAL).error).toBeDefined();
        expect(extractRefundInput({ amount_refunded_cents: "2500", refunded_at: "2026-10-20" }, TOTAL).error).toBeDefined();
    });

    it("requires the date for a refund", () => {
        expect(extractRefundInput({ amount_refunded_cents: 100 }, TOTAL).error).toMatch(/refunded_at/);
    });

    it("clears the date and Stripe id when the refund is set back to 0, keeping the note", () => {
        expect(
            extractRefundInput({ amount_refunded_cents: 0, refunded_at: "2026-10-20", stripe_refund_id: "re_1", admin_note: "entered by mistake" }, TOTAL),
        ).toEqual({ input: { amount_refunded_cents: 0, refunded_at: null, stripe_refund_id: null, admin_note: "entered by mistake" } });
    });

    it("rejects an overlong note", () => {
        expect(extractRefundInput({ amount_refunded_cents: 0, admin_note: "x".repeat(2001) }, TOTAL).error).toMatch(/admin_note/);
    });
});

describe("extractJobFilter", () => {
    it("treats absent or all as every job", () => {
        expect(extractJobFilter({})).toEqual({ filter: null });
        expect(extractJobFilter({ filter: "all" })).toEqual({ filter: null });
    });

    it("accepts the console's filters and rejects others", () => {
        expect(extractJobFilter({ filter: "needs_attention" })).toEqual({ filter: "needs_attention" });
        expect(extractJobFilter({ filter: "failed" }).error).toMatch(/filter/);
    });
});

describe("extractUserSearch", () => {
    it("returns null for no search", () => {
        expect(extractUserSearch({})).toEqual({ search: null });
        expect(extractUserSearch({ search: "  " })).toEqual({ search: null });
        expect(extractUserSearch({ search: "lena" })).toEqual({ search: "lena" });
    });
});

describe("extractAdminUserUpdate", () => {
    it("takes only the editable fields", () => {
        expect(
            extractAdminUserUpdate({ display_name: " Lena ", role: "admin", is_active: false, default_charity: 42, github_id: 1 }, false),
        ).toEqual({ input: { display_name: "Lena", role: "admin", is_active: false, default_charity: 42 } });
    });

    it("needs at least one field", () => {
        expect(extractAdminUserUpdate({ github_id: 1 }, false).error).toMatch(/Nothing to update/);
    });

    it("rejects a bad role, a non-boolean is_active, a blank name, or a bad charity id", () => {
        expect(extractAdminUserUpdate({ role: "owner" }, false).error).toMatch(/role/);
        expect(extractAdminUserUpdate({ is_active: "no" }, false).error).toMatch(/is_active/);
        expect(extractAdminUserUpdate({ display_name: "  " }, false).error).toMatch(/display_name/);
        expect(extractAdminUserUpdate({ default_charity: -3 }, false).error).toMatch(/charity/);
    });

    it("won't let an admin remove their own admin access or turn off their own account", () => {
        expect(extractAdminUserUpdate({ role: "user" }, true).error).toMatch(/your own/);
        expect(extractAdminUserUpdate({ is_active: false }, true).error).toMatch(/your own/);
        expect(extractAdminUserUpdate({ display_name: "Me" }, true).input).toEqual({ display_name: "Me" });
        // the same changes to someone else are fine
        expect(extractAdminUserUpdate({ role: "user", is_active: false }, false).error).toBeUndefined();
    });
});

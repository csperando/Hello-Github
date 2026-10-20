import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import UserBillingRepository from "../../repository/userBilling.repo";
import DesignsRepository from "../../repository/designs.repo";
import BackfillJobsRepository from "../../repository/backfillJobs.repo";
import DesignSelectionsRepository from "../../repository/designSelections.repo";
import { iGitHubUpsertInput } from "../../models/users";

// Real Postgres, mocked Stripe API calls - what's under test here is the
// transaction/catch pair actually guaranteeing at-most-one credit and
// at-most-one ledger row under true concurrency, which a fully-mocked repo
// (as in test/unit/payments.service.webhook.test.ts) can't exercise since a
// mock has no real commit/rollback semantics to race against.
const mockStripe = {
    subscriptions: { retrieve: jest.fn() },
    customers: { update: jest.fn() },
};
jest.mock("../../config/stripe", () => ({ __esModule: true, default: mockStripe }));

// imported after the mock above, matching test/unit/payments.service.webhook.test.ts's
// convention: jest.mock() calls are hoisted above every import/require in the
// file, so if this were grouped with the imports at the top, requiring
// payments.service (and its transitive require of config/stripe) would run
// the mock factory above before mockStripe is assigned, throwing a TDZ error
import { PaymentsService } from "../../services/payments.service";

describe("PaymentsService.handleWebhookEvent (concurrent duplicate delivery, real DB)", () => {
    const usersRepo = UsersRepository.repo();
    const billingRepo = UserBillingRepository.repo();
    const designsRepo = DesignsRepository.repo();
    const selectionsRepo = DesignSelectionsRepository.repo();
    const backfillJobsRepo = BackfillJobsRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -109;

    let userId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        mockStripe.subscriptions.retrieve.mockReset();
        mockStripe.customers.update.mockReset();

        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-payments-webhook-test",
            github_email: "octocat-payments-webhook-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-payments-webhook-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEwOQ==",
            github_profile_url: "https://github.com/octocat-payments-webhook-test",
            avatar_url: "https://avatars.githubusercontent.com/u/109?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        await pool.query(
            "DELETE FROM backfill_jobs WHERE selection_id IN (SELECT id FROM design_selections WHERE user_id = $1);",
            [userId],
        );
        await pool.query("DELETE FROM design_selections WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM payments WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM user_billing WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    it("writes exactly one ledger row and one backfill job when the same payment_intent.succeeded event is delivered concurrently", async () => {
        const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
        const selection = await selectionsRepo.create(userId, design.id, {
            start_date: "2024-12-29",
            year: 2025,
            repeat_indefinitely: false,
        });
        // checkout made the pending paint job for this payment intent
        await backfillJobsRepo.createPending(
            selection.id,
            { year: 2025, pattern: [0, 1, 2, 3, 4, 0, 0], start_date: "2024-12-29", custom_range: false },
            "pi_concurrent_1",
        );

        const service = new PaymentsService();
        const event = {
            id: "evt_concurrent_pi",
            type: "payment_intent.succeeded",
            data: {
                object: {
                    id: "pi_concurrent_1",
                    // no stripe_customer_id row exists for this user, so
                    // resolveUserId falls back to metadata.user_id both times
                    customer: "cus_does_not_exist",
                    amount: 1000,
                    amount_received: 1000,
                    metadata: {
                        kind: "checkout_one_time",
                        user_id: userId,
                        design_id: design.id,
                        amount_total_cents: "1000",
                        amount_platform_cents: "300",
                        amount_charity_cents: "700",
                    },
                },
            },
        } as any;

        const [r1, r2] = await Promise.all([
            service.handleWebhookEvent(event),
            service.handleWebhookEvent(event),
        ]);

        // exactly one call gets the plain success, the other a clean duplicate -
        // checked by count rather than a sorted array, since Array.sort()
        // always pushes `undefined` to the end regardless of comparator
        const results = [r1, r2];
        expect(r1.handled).toBe(true);
        expect(r2.handled).toBe(true);
        expect(results.filter((r) => r.note === undefined)).toHaveLength(1);
        expect(results.filter((r) => r.note === "duplicate")).toHaveLength(1);

        const paymentsRows = await pool.query("SELECT * FROM payments WHERE user_id = $1;", [userId]);
        expect(paymentsRows.rows).toHaveLength(1);

        const jobs = await pool.query("SELECT year, status FROM backfill_jobs WHERE selection_id = $1;", [selection.id]);
        expect(jobs.rows).toEqual([{ year: 2025, status: "awaiting_issue" }]);

        // a purchase no longer opens a paid period
        const billing = await pool.query("SELECT paid_until FROM user_billing WHERE user_id = $1;", [userId]);
        expect(billing.rows[0]?.paid_until ?? null).toBeNull();
    });

    it("writes exactly one payments row when the same invoice.paid event is delivered concurrently", async () => {
        await billingRepo.upsertCustomerId(userId, "cus_concurrent_invoice");
        mockStripe.subscriptions.retrieve.mockResolvedValue({
            id: "sub_concurrent_1",
            status: "active",
            cancel_at_period_end: false,
            metadata: {
                user_id: userId,
                design_id: "",
                amount_total_cents: "1000",
                amount_platform_cents: "300",
                amount_charity_cents: "700",
            },
            items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 }] },
        });

        const service = new PaymentsService();
        const event = {
            id: "evt_concurrent_invoice",
            type: "invoice.paid",
            data: {
                object: {
                    id: "in_concurrent_1",
                    customer: "cus_concurrent_invoice",
                    amount_paid: 1000,
                    period_start: Math.floor(Date.now() / 1000),
                    parent: { subscription_details: { subscription: "sub_concurrent_1", metadata: null } },
                },
            },
        } as any;

        const [r1, r2] = await Promise.all([
            service.handleWebhookEvent(event),
            service.handleWebhookEvent(event),
        ]);

        const results = [r1, r2];
        expect(r1.handled).toBe(true);
        expect(r2.handled).toBe(true);
        expect(results.filter((r) => r.note === undefined)).toHaveLength(1);
        expect(results.filter((r) => r.note === "duplicate")).toHaveLength(1);

        const paymentsRows = await pool.query("SELECT * FROM payments WHERE user_id = $1;", [userId]);
        expect(paymentsRows.rows).toHaveLength(1);
    });
});

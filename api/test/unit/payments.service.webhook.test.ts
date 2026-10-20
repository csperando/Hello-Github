import type { iUserBillingRepo } from "../../repository/userBilling.repo";
import type { iPaymentsRepo } from "../../repository/payments.repo";
import type { iDesignSelectionsRepo } from "../../repository/designSelections.repo";
import type { iUserRepo } from "../../repository/users.repo";
import type { iBackfillJobsRepo } from "../../repository/backfillJobs.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const billingRepoMock = createMockRepoProxy<iUserBillingRepo>();
mockRepo("repository/userBilling.repo", billingRepoMock);
const paymentsRepoMock = createMockRepoProxy<iPaymentsRepo>();
mockRepo("repository/payments.repo", paymentsRepoMock);
const selectionsRepoMock = createMockRepoProxy<iDesignSelectionsRepo>();
mockRepo("repository/designSelections.repo", selectionsRepoMock);
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);
const backfillJobsRepoMock = createMockRepoProxy<iBackfillJobsRepo>();
mockRepo("repository/backfillJobs.repo", backfillJobsRepoMock);

const mockStripe = {
    subscriptions: { retrieve: jest.fn() },
    charges: { retrieve: jest.fn() },
    customers: { update: jest.fn() },
};
jest.mock("../../config/stripe", () => ({ __esModule: true, default: mockStripe }));

// A fake client is enough here: the repo methods it's passed to are
// themselves fully mocked above, so nothing ever issues a real query against
// it. withTransaction's actual commit/rollback behavior under concurrency is
// covered by the integration tests instead.
const fakeClient = { query: jest.fn() };
const mockWithTransaction = jest.fn((fn: (client: unknown) => Promise<unknown>) => fn(fakeClient));
jest.mock("../../config/db", () => ({ __esModule: true, withTransaction: (fn: any) => mockWithTransaction(fn) }));

import { PaymentsService } from "../../services/payments.service";

const svc = () => new PaymentsService();

const oneTimeMetadata = {
    kind: "checkout_one_time",
    user_id: "u1",
    design_id: "d1",
    charity_ein_id: "42",
    amount_total_cents: "1000",
    amount_platform_cents: "300",
    amount_charity_cents: "700",
};

const evt = (type: string, object: unknown, id = "evt_1"): any => ({
    id,
    type,
    data: { object },
});

describe("PaymentsService.handleWebhookEvent", () => {
    beforeEach(() => {
        billingRepoMock.__reset();
        paymentsRepoMock.__reset();
        selectionsRepoMock.__reset();
        usersRepoMock.__reset();
        backfillJobsRepoMock.__reset();
        mockStripe.subscriptions.retrieve.mockReset();
        mockStripe.charges.retrieve.mockReset();
        mockStripe.customers.update.mockReset();

        billingRepoMock.getByStripeCustomerId.mockResolvedValue({ user_id: "u1" });
        billingRepoMock.bumpPaidUntilOneYear.mockResolvedValue({ paid_until: "2027-01-01T00:00:00.000Z" });
        billingRepoMock.setPaidUntil.mockResolvedValue({ paid_until: "2027-01-01T00:00:00.000Z" });
        billingRepoMock.updateSubscription.mockResolvedValue({});
        paymentsRepoMock.existsByStripeEventId.mockResolvedValue(false);
        paymentsRepoMock.create.mockResolvedValue({ id: "p1" });
        selectionsRepoMock.getByUserAndDesign.mockResolvedValue({ id: "s1", user_id: "u1", design_id: "d1" });
        backfillJobsRepoMock.markPaid.mockResolvedValue({ id: "j1", selection_id: "s1", status: "awaiting_issue" });
        selectionsRepoMock.setActiveExclusive.mockResolvedValue({ is_active: true });
        selectionsRepoMock.deactivateActiveForUser.mockResolvedValue([{ design_id: "d1" }]);
    });

    describe("payment_intent.succeeded (one-time)", () => {
        const pi = { id: "pi_1", customer: "cus_1", amount: 1000, amount_received: 1000, metadata: oneTimeMetadata };

        it("writes a one_time ledger row and creates the design's backfill job in the same transaction", async () => {
            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));

            expect(res.handled).toBe(true);
            expect(paymentsRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: "u1",
                    stripe_event_id: "evt_1",
                    kind: "one_time",
                    amount_platform_cents: 300,
                    amount_charity_cents: 700,
                    charity_ein_id: 42,
                    period_start: null,
                    period_end: null,
                }),
                fakeClient,
            );
            // the paint job checkout made for this payment moves out of
            // pending_payment in the same transaction as the ledger row
            expect(backfillJobsRepoMock.markPaid).toHaveBeenCalledWith("pi_1", fakeClient);
        });

        it("still records the payment when the paint job is cancelled because another paint already has the design locked", async () => {
            backfillJobsRepoMock.markPaid.mockResolvedValue({ id: "j2", selection_id: "s1", status: "cancelled" });

            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));

            expect(res.handled).toBe(true);
            expect(paymentsRepoMock.create).toHaveBeenCalled();
        });

        it("no longer opens a paid period or activates the design", async () => {
            await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));

            expect(billingRepoMock.bumpPaidUntilOneYear).not.toHaveBeenCalled();
            expect(selectionsRepoMock.setActiveExclusive).not.toHaveBeenCalled();
        });

        it("no longer saves the card as the customer's default", async () => {
            await svc().handleWebhookEvent(evt("payment_intent.succeeded", { ...pi, payment_method: "pm_1" }));
            expect(mockStripe.customers.update).not.toHaveBeenCalled();
        });

        it("ignores a PI that isn't one of our one-time checkout PIs", async () => {
            const res = await svc().handleWebhookEvent(
                evt("payment_intent.succeeded", { id: "pi_sub", customer: "cus_1", metadata: {} }),
            );
            expect(res.handled).toBe(false);
            expect(paymentsRepoMock.create).not.toHaveBeenCalled();
        });

        it("skips a duplicate event id (already in the ledger)", async () => {
            paymentsRepoMock.existsByStripeEventId.mockResolvedValue(true);
            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));
            expect(res).toEqual({ handled: true, note: "duplicate" });
            expect(paymentsRepoMock.create).not.toHaveBeenCalled();
            expect(backfillJobsRepoMock.markPaid).not.toHaveBeenCalled();
        });

        // the money still arrived, so the payment is recorded even with no
        // pending paint job to move along
        it("records the payment when checkout left no pending paint job for it", async () => {
            backfillJobsRepoMock.markPaid.mockResolvedValue(undefined);
            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));
            expect(res.handled).toBe(true);
            expect(paymentsRepoMock.create).toHaveBeenCalled();
        });

        it("falls back to metadata.user_id when the customer is unknown", async () => {
            billingRepoMock.getByStripeCustomerId.mockResolvedValue(null);
            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));
            expect(res.handled).toBe(true);
            expect(paymentsRepoMock.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1" }), fakeClient);
        });

        it("returns a clean duplicate response when it loses the race on the ledger's unique constraint", async () => {
            paymentsRepoMock.create.mockRejectedValueOnce({ code: "23505", constraint: "payments_stripe_event_id_unique" });
            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));

            expect(res).toEqual({ handled: true, note: "duplicate" });
            expect(backfillJobsRepoMock.markPaid).not.toHaveBeenCalled();
        });

        it("still throws an unrelated DB error from the transaction (so Stripe retries)", async () => {
            paymentsRepoMock.create.mockRejectedValueOnce({ code: "23505", constraint: "some_other_constraint" });
            await expect(svc().handleWebhookEvent(evt("payment_intent.succeeded", pi))).rejects.toBeDefined();
        });

        it("throws (so Stripe retries) when the user cannot be resolved at all", async () => {
            billingRepoMock.getByStripeCustomerId.mockResolvedValue(null);
            await expect(
                svc().handleWebhookEvent(
                    evt("payment_intent.succeeded", { ...pi, metadata: { ...oneTimeMetadata, user_id: "" } }),
                ),
            ).rejects.toThrow(/cannot resolve user/);
        });
    });

    describe("payment_intent.canceled", () => {
        it("cancels the abandoned checkout's pending paint job", async () => {
            backfillJobsRepoMock.cancelByPaymentIntent.mockResolvedValue({ id: "j1", status: "cancelled" });

            const res = await svc().handleWebhookEvent(evt("payment_intent.canceled", { id: "pi_1" }));

            expect(res.handled).toBe(true);
            expect(backfillJobsRepoMock.cancelByPaymentIntent).toHaveBeenCalledWith("pi_1");
        });
    });

    describe("payment_intent.payment_failed", () => {
        // the same payment intent can still succeed on a retry with another card
        it("leaves the pending paint job alone", async () => {
            const res = await svc().handleWebhookEvent(evt("payment_intent.payment_failed", { id: "pi_1" }));

            expect(res.handled).toBe(false);
            expect(backfillJobsRepoMock.cancelByPaymentIntent).not.toHaveBeenCalled();
        });
    });

    describe("invoice.paid (subscription)", () => {
        const invoice = {
            id: "in_1",
            customer: "cus_1",
            amount_paid: 1000,
            period_start: 1735689600,
            parent: { subscription_details: { subscription: "sub_1", metadata: null } },
        };

        beforeEach(() => {
            mockStripe.subscriptions.retrieve.mockResolvedValue({
                id: "sub_1",
                status: "active",
                cancel_at_period_end: false,
                metadata: { ...oneTimeMetadata, kind: "" },
                items: { data: [{ current_period_end: 1767225600 }] },
            });
        });

        it("sets paid_until to the subscription period end, syncs status, and writes a subscription ledger row", async () => {
            const res = await svc().handleWebhookEvent(evt("invoice.paid", invoice));

            expect(res.handled).toBe(true);
            const iso = new Date(1767225600 * 1000).toISOString();
            expect(billingRepoMock.setPaidUntil).toHaveBeenCalledWith("u1", iso);
            expect(billingRepoMock.updateSubscription).toHaveBeenCalledWith(
                "u1",
                expect.objectContaining({ stripe_subscription_id: "sub_1", subscription_status: "active", auto_renew: true }),
            );
            expect(paymentsRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({ kind: "subscription", amount_platform_cents: 300, period_end: iso }),
            );
            expect(selectionsRepoMock.setActiveExclusive).toHaveBeenCalledWith("u1", "d1");
        });

        it("ignores an invoice with no subscription", async () => {
            const res = await svc().handleWebhookEvent(evt("invoice.paid", { id: "in_x", customer: "cus_1", parent: null }));
            expect(res.handled).toBe(false);
            expect(billingRepoMock.setPaidUntil).not.toHaveBeenCalled();
        });

        it("skips a duplicate event id", async () => {
            paymentsRepoMock.existsByStripeEventId.mockResolvedValue(true);
            const res = await svc().handleWebhookEvent(evt("invoice.paid", invoice));
            expect(res).toEqual({ handled: true, note: "duplicate" });
        });

        it("returns a clean duplicate response when it loses the race on the ledger's unique constraint", async () => {
            paymentsRepoMock.create.mockRejectedValueOnce({ code: "23505", constraint: "payments_stripe_event_id_unique" });
            const res = await svc().handleWebhookEvent(evt("invoice.paid", invoice));

            expect(res).toEqual({ handled: true, note: "duplicate" });
            expect(selectionsRepoMock.setActiveExclusive).not.toHaveBeenCalled();
        });

        it("still throws an unrelated DB error from the insert (so Stripe retries)", async () => {
            paymentsRepoMock.create.mockRejectedValueOnce({ code: "23505", constraint: "some_other_constraint" });
            await expect(svc().handleWebhookEvent(evt("invoice.paid", invoice))).rejects.toBeDefined();
        });
    });

    describe("customer.subscription.updated / deleted", () => {
        it("on cancel-at-period-end, turns auto_renew off but leaves paid_until untouched", async () => {
            const res = await svc().handleWebhookEvent(
                evt("customer.subscription.updated", {
                    id: "sub_1",
                    customer: "cus_1",
                    status: "active",
                    cancel_at_period_end: true,
                }),
            );
            expect(res.handled).toBe(true);
            expect(billingRepoMock.updateSubscription).toHaveBeenCalledWith("u1", {
                subscription_status: "active",
                auto_renew: false,
            });
            expect(billingRepoMock.setPaidUntil).not.toHaveBeenCalled();
        });

        it("on deletion (canceled), records the status and auto_renew off", async () => {
            const res = await svc().handleWebhookEvent(
                evt("customer.subscription.deleted", {
                    id: "sub_1",
                    customer: "cus_1",
                    status: "canceled",
                    cancel_at_period_end: false,
                }),
            );
            expect(res.handled).toBe(true);
            expect(billingRepoMock.updateSubscription).toHaveBeenCalledWith("u1", {
                subscription_status: "canceled",
                auto_renew: false,
            });
        });
    });

    describe("charge.refunded / charge.dispute.created", () => {
        it("on refund, expires the paid period now and deactivates the active selection", async () => {
            const res = await svc().handleWebhookEvent(
                evt("charge.refunded", { id: "ch_1", customer: "cus_1" }),
            );
            expect(res.handled).toBe(true);
            expect(billingRepoMock.setPaidUntil).toHaveBeenCalledTimes(1);
            expect(selectionsRepoMock.deactivateActiveForUser).toHaveBeenCalledWith("u1");
        });

        it("on dispute, resolves the customer via the charge, then expires and deactivates", async () => {
            mockStripe.charges.retrieve.mockResolvedValue({ id: "ch_1", customer: "cus_1" });
            const res = await svc().handleWebhookEvent(
                evt("charge.dispute.created", { id: "dp_1", charge: "ch_1" }),
            );
            expect(mockStripe.charges.retrieve).toHaveBeenCalledWith("ch_1");
            expect(res.handled).toBe(true);
            expect(selectionsRepoMock.deactivateActiveForUser).toHaveBeenCalledWith("u1");
        });
    });

    it("ignores an unrecognised event type", async () => {
        const res = await svc().handleWebhookEvent(evt("customer.created", { id: "cus_1" }));
        expect(res.handled).toBe(false);
    });
});

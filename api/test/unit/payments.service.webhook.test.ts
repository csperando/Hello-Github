import type { iUserBillingRepo } from "../../repository/userBilling.repo";
import type { iPaymentsRepo } from "../../repository/payments.repo";
import type { iDesignSelectionsRepo } from "../../repository/designSelections.repo";
import type { iUserRepo } from "../../repository/users.repo";
import { createMockRepoProxy, mockRepo } from "../setup.mock.repo";

const billingRepoMock = createMockRepoProxy<iUserBillingRepo>();
mockRepo("repository/userBilling.repo", billingRepoMock);
const paymentsRepoMock = createMockRepoProxy<iPaymentsRepo>();
mockRepo("repository/payments.repo", paymentsRepoMock);
const selectionsRepoMock = createMockRepoProxy<iDesignSelectionsRepo>();
mockRepo("repository/designSelections.repo", selectionsRepoMock);
const usersRepoMock = createMockRepoProxy<iUserRepo>();
mockRepo("repository/users.repo", usersRepoMock);

const mockStripe = {
    subscriptions: { retrieve: jest.fn() },
    charges: { retrieve: jest.fn() },
};
jest.mock("../../config/stripe", () => ({ __esModule: true, default: mockStripe }));

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
        mockStripe.subscriptions.retrieve.mockReset();
        mockStripe.charges.retrieve.mockReset();

        billingRepoMock.getByStripeCustomerId.mockResolvedValue({ user_id: "u1" });
        billingRepoMock.bumpPaidUntilOneYear.mockResolvedValue({ paid_until: "2027-01-01T00:00:00.000Z" });
        billingRepoMock.setPaidUntil.mockResolvedValue({ paid_until: "2027-01-01T00:00:00.000Z" });
        billingRepoMock.updateSubscription.mockResolvedValue({});
        paymentsRepoMock.existsByStripeEventId.mockResolvedValue(false);
        paymentsRepoMock.create.mockResolvedValue({ id: "p1" });
        selectionsRepoMock.getByUserAndDesign.mockResolvedValue({ user_id: "u1", design_id: "d1" });
        selectionsRepoMock.setActiveExclusive.mockResolvedValue({ is_active: true });
        selectionsRepoMock.deactivateActiveForUser.mockResolvedValue([{ design_id: "d1" }]);
    });

    describe("payment_intent.succeeded (one-time)", () => {
        const pi = { id: "pi_1", customer: "cus_1", amount: 1000, amount_received: 1000, metadata: oneTimeMetadata };

        it("bumps paid_until, writes a one_time ledger row, and activates the design", async () => {
            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));

            expect(res.handled).toBe(true);
            expect(billingRepoMock.bumpPaidUntilOneYear).toHaveBeenCalledWith("u1");
            expect(paymentsRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: "u1",
                    stripe_event_id: "evt_1",
                    kind: "one_time",
                    amount_platform_cents: 300,
                    amount_charity_cents: 700,
                    charity_ein_id: 42,
                    period_end: "2027-01-01T00:00:00.000Z",
                }),
            );
            expect(selectionsRepoMock.setActiveExclusive).toHaveBeenCalledWith("u1", "d1");
        });

        it("ignores a PI that isn't one of our one-time checkout PIs", async () => {
            const res = await svc().handleWebhookEvent(
                evt("payment_intent.succeeded", { id: "pi_sub", customer: "cus_1", metadata: {} }),
            );
            expect(res.handled).toBe(false);
            expect(billingRepoMock.bumpPaidUntilOneYear).not.toHaveBeenCalled();
        });

        it("skips a duplicate event id (already in the ledger)", async () => {
            paymentsRepoMock.existsByStripeEventId.mockResolvedValue(true);
            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));
            expect(res).toEqual({ handled: true, note: "duplicate" });
            expect(paymentsRepoMock.create).not.toHaveBeenCalled();
        });

        it("does not fail the webhook when the design to activate is no longer selected", async () => {
            selectionsRepoMock.getByUserAndDesign.mockResolvedValue(undefined);
            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));
            expect(res.handled).toBe(true);
            expect(selectionsRepoMock.setActiveExclusive).not.toHaveBeenCalled();
        });

        it("falls back to metadata.user_id when the customer is unknown", async () => {
            billingRepoMock.getByStripeCustomerId.mockResolvedValue(null);
            const res = await svc().handleWebhookEvent(evt("payment_intent.succeeded", pi));
            expect(res.handled).toBe(true);
            expect(billingRepoMock.bumpPaidUntilOneYear).toHaveBeenCalledWith("u1");
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

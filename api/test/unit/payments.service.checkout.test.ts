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
    customers: { create: jest.fn(), retrieve: jest.fn() },
    paymentIntents: { create: jest.fn() },
    subscriptions: { create: jest.fn() },
    products: { search: jest.fn(), create: jest.fn() },
};
jest.mock("../../config/stripe", () => ({ __esModule: true, default: mockStripe }));

import { PaymentsService, __resetYearProductCacheForTests } from "../../services/payments.service";

const baseInput = (overrides: Record<string, unknown> = {}) => ({
    userId: "u1",
    designId: "d1",
    charityEinId: 42,
    totalCents: 1000,
    platformCents: 300,
    autoRenew: false,
    attemptId: "attempt-1",
    ...overrides,
});

describe("PaymentsService.createCheckout", () => {
    beforeEach(() => {
        billingRepoMock.__reset();
        paymentsRepoMock.__reset();
        selectionsRepoMock.__reset();
        usersRepoMock.__reset();
        mockStripe.customers.create.mockReset();
        mockStripe.customers.retrieve.mockReset();
        mockStripe.paymentIntents.create.mockReset();
        mockStripe.subscriptions.create.mockReset();
        mockStripe.products.search.mockReset();
        mockStripe.products.create.mockReset();
        __resetYearProductCacheForTests();

        billingRepoMock.getByUserId.mockResolvedValue(null);
        billingRepoMock.upsertCustomerId.mockResolvedValue({ user_id: "u1", stripe_customer_id: "cus_1" });
        usersRepoMock.getUserById.mockResolvedValue({ id: "u1", email: "u1@example.com", github_username: "octo" });
        selectionsRepoMock.getByUserAndDesign.mockResolvedValue({ user_id: "u1", design_id: "d1" });
        mockStripe.customers.create.mockResolvedValue({ id: "cus_1" });
        mockStripe.customers.retrieve.mockImplementation(async (id: string) => ({ id }));
        mockStripe.paymentIntents.create.mockResolvedValue({ id: "pi_1", client_secret: "pi_1_secret" });
        mockStripe.products.search.mockResolvedValue({ data: [{ id: "prod_1" }] });
        mockStripe.subscriptions.create.mockResolvedValue({
            id: "sub_1",
            latest_invoice: { confirmation_secret: { client_secret: "pi_sub_secret", type: "payment_intent" } },
        });
    });

    it("rejects an amount that fails server-side validation without calling Stripe", async () => {
        const res = await new PaymentsService().createCheckout(baseInput({ platformCents: -1 }));
        expect(res.error).toMatch(/platform amount cannot be negative/i);
        expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    // each purchase buys one design, so an unexpired paid_until no longer blocks checkout
    it("charges a user whose paid_until is still in the future", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({ paid_until: new Date(Date.now() + 8.64e7).toISOString() });

        const res = await new PaymentsService().createCheckout(baseInput());
        expect(res.clientSecret).toBe("pi_1_secret");
    });

    it("rejects a designId the user has no selection for", async () => {
        selectionsRepoMock.getByUserAndDesign.mockResolvedValue(undefined);

        const res = await new PaymentsService().createCheckout(baseInput());
        expect(res.error).toMatch(/isn't one of your selections/i);
        expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("creates a one-time PaymentIntent with the authoritative split in metadata and returns its client secret", async () => {
        const res = await new PaymentsService().createCheckout(baseInput());

        expect(res.clientSecret).toBe("pi_1_secret");
        expect(res.amounts).toEqual({
            amount_total_cents: 1000,
            amount_platform_cents: 300,
            amount_charity_cents: 700,
        });

        const params = mockStripe.paymentIntents.create.mock.calls[0][0];
        expect(params.amount).toBe(1000);
        expect(params.currency).toBe("usd");
        expect(params.metadata).toMatchObject({
            user_id: "u1",
            design_id: "d1",
            charity_ein_id: "42",
            amount_charity_cents: "700",
        });
        const options = mockStripe.paymentIntents.create.mock.calls[0][1];
        expect(options.idempotencyKey).toContain("checkout-onetime-u1-1000-300");
    });

    // nothing charges a saved card any more (no auto-renew), so don't keep one
    it("does not save the card for future off-session charges", async () => {
        await new PaymentsService().createCheckout(baseInput());
        expect(mockStripe.paymentIntents.create.mock.calls[0][0]).not.toHaveProperty("setup_future_usage");
    });

    // The idempotency key only dedupes retries within one checkout attempt. A
    // later purchase with the same amount + design must get a fresh PI, not the
    // already-paid one Stripe cached under the old key.
    it("scopes the one-time idempotency key to the checkout attempt", async () => {
        const service = new PaymentsService();
        await service.createCheckout(baseInput({ attemptId: "attempt-1" }));
        await service.createCheckout(baseInput({ attemptId: "attempt-1" }));
        await service.createCheckout(baseInput({ attemptId: "attempt-2" }));

        const keys = mockStripe.paymentIntents.create.mock.calls.map((c: any[]) => c[1].idempotencyKey);
        expect(keys[0]).toBe(keys[1]);
        expect(keys[2]).not.toBe(keys[0]);
    });

    it("scopes the subscription idempotency key to the checkout attempt", async () => {
        const service = new PaymentsService();
        await service.createCheckout(baseInput({ autoRenew: true, attemptId: "attempt-1" }));
        await service.createCheckout(baseInput({ autoRenew: true, attemptId: "attempt-2" }));

        const keys = mockStripe.subscriptions.create.mock.calls.map((c: any[]) => c[1].idempotencyKey);
        expect(keys[1]).not.toBe(keys[0]);
    });

    it("provisions a Stripe customer once and persists the id", async () => {
        await new PaymentsService().createCheckout(baseInput());
        expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
        expect(billingRepoMock.upsertCustomerId).toHaveBeenCalledWith("u1", "cus_1");
    });

    it("reuses an existing Stripe customer id without creating another", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({ stripe_customer_id: "cus_existing", paid_until: null });

        await new PaymentsService().createCheckout(baseInput());
        expect(mockStripe.customers.create).not.toHaveBeenCalled();
        const params = mockStripe.paymentIntents.create.mock.calls[0][0];
        expect(params.customer).toBe("cus_existing");
    });

    describe("when the stored customer no longer exists in Stripe", () => {
        beforeEach(() => {
            billingRepoMock.getByUserId.mockResolvedValue({ stripe_customer_id: "cus_stale", paid_until: null });
            billingRepoMock.replaceCustomerId.mockResolvedValue({ user_id: "u1", stripe_customer_id: "cus_1" });
        });

        it("replaces a resource_missing customer (e.g. test-mode id under a live key)", async () => {
            mockStripe.customers.retrieve.mockRejectedValue(
                Object.assign(new Error("No such customer: 'cus_stale'"), { code: "resource_missing" }),
            );

            await new PaymentsService().createCheckout(baseInput());

            expect(mockStripe.customers.retrieve).toHaveBeenCalledWith("cus_stale");
            expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
            expect(billingRepoMock.replaceCustomerId).toHaveBeenCalledWith("u1", "cus_1");
            expect(billingRepoMock.upsertCustomerId).not.toHaveBeenCalled();
            expect(mockStripe.paymentIntents.create.mock.calls[0][0].customer).toBe("cus_1");
        });

        it("replaces a customer that was deleted in Stripe", async () => {
            mockStripe.customers.retrieve.mockResolvedValue({ id: "cus_stale", deleted: true });

            await new PaymentsService().createCheckout(baseInput());

            expect(billingRepoMock.replaceCustomerId).toHaveBeenCalledWith("u1", "cus_1");
            expect(mockStripe.paymentIntents.create.mock.calls[0][0].customer).toBe("cus_1");
        });

        it("rethrows any other Stripe failure without minting a replacement", async () => {
            mockStripe.customers.retrieve.mockRejectedValue(
                Object.assign(new Error("Stripe is down"), { code: "api_connection_error" }),
            );

            await expect(new PaymentsService().createCheckout(baseInput())).rejects.toThrow("Stripe is down");
            expect(mockStripe.customers.create).not.toHaveBeenCalled();
            expect(billingRepoMock.replaceCustomerId).not.toHaveBeenCalled();
        });
    });

    it("creates an annual Subscription (not a one-time PI) when autoRenew is set, returning the first invoice's client secret", async () => {
        const res = await new PaymentsService().createCheckout(baseInput({ autoRenew: true }));

        expect(mockStripe.subscriptions.create).toHaveBeenCalledTimes(1);
        expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
        expect(res.clientSecret).toBe("pi_sub_secret");

        const params = mockStripe.subscriptions.create.mock.calls[0][0];
        expect(params.items[0].price_data.recurring.interval).toBe("year");
        expect(params.items[0].price_data.unit_amount).toBe(1000);
        expect(params.items[0].price_data.product).toBe("prod_1");
        expect(params.expand).toContain("latest_invoice.confirmation_secret");
    });

    it("returns an error (not a silent success) when the subscription's first invoice has no client secret", async () => {
        mockStripe.subscriptions.create.mockResolvedValue({ id: "sub_broke", latest_invoice: { confirmation_secret: null } });

        const res = await new PaymentsService().createCheckout(baseInput({ autoRenew: true }));

        expect(res.clientSecret).toBeUndefined();
        expect(res.error).toMatch(/could not start checkout/i);
    });

    it("creates the reusable Stripe Product on the very first subscription, then memoises it", async () => {
        mockStripe.products.search.mockResolvedValue({ data: [] });
        mockStripe.products.create.mockResolvedValue({ id: "prod_new" });

        await new PaymentsService().createCheckout(baseInput({ autoRenew: true }));
        expect(mockStripe.products.create).toHaveBeenCalledTimes(1);

        // second subscription in the same process reuses the memoised id
        await new PaymentsService().createCheckout(baseInput({ autoRenew: true }));
        expect(mockStripe.products.create).toHaveBeenCalledTimes(1);
    });
});

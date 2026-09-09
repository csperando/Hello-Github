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
    customers: { create: jest.fn(), update: jest.fn() },
    subscriptions: { create: jest.fn(), update: jest.fn() },
    products: { search: jest.fn(), create: jest.fn() },
};
jest.mock("../../config/stripe", () => ({ __esModule: true, default: mockStripe }));

import { PaymentsService, __resetYearProductCacheForTests } from "../../services/payments.service";

const svc = () => new PaymentsService();
const future = () => new Date(Date.now() + 30 * 8.64e7).toISOString();
const past = () => new Date(Date.now() - 8.64e7).toISOString();

beforeEach(() => {
    billingRepoMock.__reset();
    paymentsRepoMock.__reset();
    selectionsRepoMock.__reset();
    usersRepoMock.__reset();
    mockStripe.customers.create.mockReset();
    mockStripe.customers.update.mockReset();
    mockStripe.subscriptions.create.mockReset();
    mockStripe.subscriptions.update.mockReset();
    mockStripe.products.search.mockReset().mockResolvedValue({ data: [{ id: "prod_1" }] });
    mockStripe.products.create.mockReset();
    __resetYearProductCacheForTests();

    billingRepoMock.updateSubscription.mockResolvedValue({});
    usersRepoMock.getUserById.mockResolvedValue({ id: "u1", email: "u1@example.com" });
});

describe("cancelSubscription", () => {
    it("sets cancel_at_period_end on Stripe and flips auto_renew off", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({ stripe_subscription_id: "sub_1" });

        const res = await svc().cancelSubscription("u1");

        expect(res.ok).toBe(true);
        expect(mockStripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
        expect(billingRepoMock.updateSubscription).toHaveBeenCalledWith("u1", { auto_renew: false });
    });

    it("errors when the user has no subscription", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({ stripe_subscription_id: null });
        const res = await svc().cancelSubscription("u1");
        expect(res.error).toMatch(/don't have an auto-renewing subscription/i);
        expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
    });
});

describe("enableAutoRenew", () => {
    beforeEach(() => {
        billingRepoMock.getByUserId.mockResolvedValue({
            paid_until: future(),
            stripe_subscription_id: null,
            stripe_customer_id: "cus_1",
        });
        paymentsRepoMock.getLatestForUser.mockResolvedValue({
            amount_total_cents: 1000,
            amount_platform_cents: 300,
            amount_charity_cents: 700,
            charity_ein_id: 42,
        });
        mockStripe.subscriptions.create.mockResolvedValue({ id: "sub_new", status: "trialing" });
    });

    it("creates a trial-until-paid_until annual subscription reusing the last payment's split", async () => {
        const billing = { paid_until: future(), stripe_subscription_id: null, stripe_customer_id: "cus_1" };
        billingRepoMock.getByUserId.mockResolvedValue(billing);

        const res = await svc().enableAutoRenew("u1");

        expect(res.ok).toBe(true);
        const params = mockStripe.subscriptions.create.mock.calls[0][0];
        expect(params.trial_end).toBe(Math.floor(new Date(billing.paid_until).getTime() / 1000));
        expect(params.items[0].price_data.unit_amount).toBe(1000);
        expect(params.metadata).toMatchObject({ amount_platform_cents: "300", charity_ein_id: "42" });
        expect(billingRepoMock.updateSubscription).toHaveBeenCalledWith("u1", {
            stripe_subscription_id: "sub_new",
            subscription_status: "trialing",
            auto_renew: true,
        });
    });

    it("errors when the user is not currently covered", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({ paid_until: past() });
        const res = await svc().enableAutoRenew("u1");
        expect(res.error).toMatch(/active paid period/i);
        expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
    });

    it("errors when auto-renew is already on", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({
            paid_until: future(),
            stripe_subscription_id: "sub_x",
            subscription_status: "active",
        });
        const res = await svc().enableAutoRenew("u1");
        expect(res.error).toMatch(/already on/i);
    });

    it("errors when there is no prior payment to base the amount on", async () => {
        paymentsRepoMock.getLatestForUser.mockResolvedValue(null);
        const res = await svc().enableAutoRenew("u1");
        expect(res.error).toMatch(/no previous payment/i);
    });
});

describe("reconcileLapsedUsers", () => {
    it("deactivates each lapsed user's active selection and counts them", async () => {
        billingRepoMock.listLapsedActiveUsers.mockResolvedValue([
            { user_id: "u1", design_id: "d1" },
            { user_id: "u2", design_id: "d2" },
        ]);
        selectionsRepoMock.deactivateActiveForUser.mockResolvedValue([{ design_id: "x" }]);

        const res = await svc().reconcileLapsedUsers();

        expect(res).toEqual({ deactivated: 2 });
        expect(selectionsRepoMock.deactivateActiveForUser).toHaveBeenCalledTimes(2);
    });

    it("is a no-op when nobody has lapsed", async () => {
        billingRepoMock.listLapsedActiveUsers.mockResolvedValue([]);
        const res = await svc().reconcileLapsedUsers();
        expect(res).toEqual({ deactivated: 0 });
        expect(selectionsRepoMock.deactivateActiveForUser).not.toHaveBeenCalled();
    });
});

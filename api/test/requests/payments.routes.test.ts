import { iResponse } from "../../models/response";
import request from "supertest";
import { config } from "../../config/config";
import { signedSidCookie } from "../helpers";

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
    paymentIntents: { create: jest.fn() },
    subscriptions: { create: jest.fn(), update: jest.fn() },
    products: { search: jest.fn(), create: jest.fn() },
};
jest.mock("../../config/stripe", () => ({ __esModule: true, default: mockStripe }));

import server from "../server";

afterAll(() => server.close());

const userId = "323e4567-e89b-12d3-a456-426614174099";
const cookie = signedSidCookie(userId);
const apiKeyHeader = { "X-API-Key": config.SCHEDULER_API_KEY };

const validBody = { totalCents: 1000, platformCents: 300, autoRenew: false, designId: "d1", charityEinId: 42 };

beforeEach(() => {
    billingRepoMock.__reset();
    paymentsRepoMock.__reset();
    selectionsRepoMock.__reset();
    usersRepoMock.__reset();
    mockStripe.customers.create.mockReset().mockResolvedValue({ id: "cus_1" });
    mockStripe.customers.update.mockReset();
    mockStripe.paymentIntents.create.mockReset().mockResolvedValue({ id: "pi_1", client_secret: "pi_1_secret" });
    mockStripe.subscriptions.create.mockReset();
    mockStripe.subscriptions.update.mockReset().mockResolvedValue({});
    mockStripe.products.search.mockReset().mockResolvedValue({ data: [{ id: "prod_1" }] });
    mockStripe.products.create.mockReset();

    billingRepoMock.getByUserId.mockResolvedValue(null);
    billingRepoMock.upsertCustomerId.mockResolvedValue({ stripe_customer_id: "cus_1" });
    billingRepoMock.updateSubscription.mockResolvedValue({});
    usersRepoMock.getUserById.mockResolvedValue({ id: userId, email: "u@example.com" });
    selectionsRepoMock.getByUserAndDesign.mockResolvedValue({ user_id: userId, design_id: "d1" });
});

describe("POST /payments/checkout", () => {
    it("401s without a session cookie", async () => {
        const res = await request(server).post("/payments/checkout").send(validBody);
        expect(res.status).toBe(401);
    });

    it("400s a malformed body", async () => {
        const res = await request(server).post("/payments/checkout").set("Cookie", cookie).send({ totalCents: "lots" });
        expect(res.status).toBe(400);
    });

    it("400s an amount that fails the platform floor", async () => {
        const res = await request(server)
            .post("/payments/checkout")
            .set("Cookie", cookie)
            .send({ ...validBody, platformCents: 1 });
        expect(res.status).toBe(400);
        const body: iResponse = JSON.parse(res.text);
        expect(body.error).toMatch(/platform amount must be at least/i);
    });

    it("returns a client secret and the authoritative amounts on success", async () => {
        const res = await request(server).post("/payments/checkout").set("Cookie", cookie).send(validBody);
        expect(res.status).toBe(200);
        const body: iResponse = JSON.parse(res.text);
        expect(body.data![0]).toMatchObject({
            client_secret: "pi_1_secret",
            amount_total_cents: 1000,
            amount_platform_cents: 300,
            amount_charity_cents: 700,
        });
    });

    it("409s when the user is already covered", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({ paid_until: new Date(Date.now() + 8.64e7).toISOString() });
        const res = await request(server).post("/payments/checkout").set("Cookie", cookie).send(validBody);
        expect(res.status).toBe(409);
    });
});

describe("GET /payments", () => {
    it("returns the caller's history", async () => {
        paymentsRepoMock.listForUser.mockResolvedValue([{ id: "p1", amount_total_cents: 1000 }]);
        const res = await request(server).get("/payments").set("Cookie", cookie);
        expect(res.status).toBe(200);
        const body: iResponse = JSON.parse(res.text);
        expect(body.data).toEqual([{ id: "p1", amount_total_cents: 1000 }]);
        expect(paymentsRepoMock.listForUser).toHaveBeenCalledWith(userId);
    });

    it("401s without a cookie", async () => {
        expect((await request(server).get("/payments")).status).toBe(401);
    });
});

describe("PATCH /payments/subscription", () => {
    it("400s a non-boolean auto_renew", async () => {
        const res = await request(server).patch("/payments/subscription").set("Cookie", cookie).send({ auto_renew: "yes" });
        expect(res.status).toBe(400);
    });

    it("cancels when auto_renew:false", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({ stripe_subscription_id: "sub_1" });
        const res = await request(server).patch("/payments/subscription").set("Cookie", cookie).send({ auto_renew: false });
        expect(res.status).toBe(200);
        expect(mockStripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    });

    it("surfaces the service error (e.g. no subscription to cancel) as a 400", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({ stripe_subscription_id: null });
        const res = await request(server).patch("/payments/subscription").set("Cookie", cookie).send({ auto_renew: false });
        expect(res.status).toBe(400);
    });
});

describe("POST /payments/reconcile", () => {
    it("401s without the API key", async () => {
        expect((await request(server).post("/payments/reconcile")).status).toBe(401);
    });

    it("runs the sweep and returns a count with the API key", async () => {
        billingRepoMock.listLapsedActiveUsers.mockResolvedValue([{ user_id: "u9", design_id: "d9" }]);
        selectionsRepoMock.deactivateActiveForUser.mockResolvedValue([{ design_id: "d9" }]);

        const res = await request(server).post("/payments/reconcile").set(apiKeyHeader);
        expect(res.status).toBe(200);
        const body: iResponse = JSON.parse(res.text);
        expect(body.data).toEqual([{ deactivated: 1 }]);
    });
});

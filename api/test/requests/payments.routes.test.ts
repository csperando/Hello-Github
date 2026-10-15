import { iResponse } from "../../models/response";
import request from "supertest";
import { config } from "../../config/config";
import { signedSidCookie } from "../helpers";

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
    customers: { create: jest.fn(), update: jest.fn(), retrieve: jest.fn() },
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

const validBody = {
    totalCents: 1000,
    platformCents: 300,
    designId: "d1",
    charityEinId: 42,
    attemptId: "3f1c2b9e-8d4a-4c7e-9b1a-2e5f6a7b8c9d",
};

beforeEach(() => {
    billingRepoMock.__reset();
    paymentsRepoMock.__reset();
    selectionsRepoMock.__reset();
    usersRepoMock.__reset();
    backfillJobsRepoMock.__reset();
    mockStripe.customers.create.mockReset().mockResolvedValue({ id: "cus_1" });
    mockStripe.customers.update.mockReset();
    mockStripe.customers.retrieve.mockReset().mockImplementation(async (id: string) => ({ id }));
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

    it("400s a negative platform amount", async () => {
        const res = await request(server)
            .post("/payments/checkout")
            .set("Cookie", cookie)
            .send({ ...validBody, platformCents: -1 });
        expect(res.status).toBe(400);
        const body: iResponse = JSON.parse(res.text);
        expect(body.error).toMatch(/platformCents must be a non-negative/i);
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

    it("charges a user whose paid_until is still in the future (no coverage gate)", async () => {
        billingRepoMock.getByUserId.mockResolvedValue({ paid_until: new Date(Date.now() + 8.64e7).toISOString() });
        const res = await request(server).post("/payments/checkout").set("Cookie", cookie).send(validBody);
        expect(res.status).toBe(200);
    });

    it("400s a body without a designId", async () => {
        const { designId: _omit, ...body } = validBody;
        const res = await request(server).post("/payments/checkout").set("Cookie", cookie).send(body);
        expect(res.status).toBe(400);
    });
});

describe("GET /payments/backfill/:designId", () => {
    it("401s without a session cookie", async () => {
        const res = await request(server).get("/payments/backfill/d1");
        expect(res.status).toBe(401);
    });

    it("returns the caller's job for that design", async () => {
        backfillJobsRepoMock.getByUserAndDesign.mockResolvedValue({
            id: "j1",
            user_id: userId,
            design_id: "d1",
            year: 2025,
            status: "awaiting_issue",
            issue_url: null,
        });

        const res = await request(server).get("/payments/backfill/d1").set("Cookie", cookie);
        expect(res.status).toBe(200);
        const body: iResponse = JSON.parse(res.text);
        expect(body.data![0]).toEqual({ id: "j1", design_id: "d1", year: 2025, status: "awaiting_issue", issue_url: null });
        expect(backfillJobsRepoMock.getByUserAndDesign).toHaveBeenCalledWith(userId, "d1");
    });

    it("404s when the caller has no job for that design", async () => {
        backfillJobsRepoMock.getByUserAndDesign.mockResolvedValue(undefined);
        const res = await request(server).get("/payments/backfill/d1").set("Cookie", cookie);
        expect(res.status).toBe(404);
    });
});

describe("GET /payments", () => {
    it("returns the caller's history", async () => {
        const payment = {
            id: "p1",
            kind: "one_time",
            status: "succeeded",
            amount_total_cents: 1000,
            amount_platform_cents: 300,
            amount_charity_cents: 700,
            charity_ein_id: 42,
            period_start: null,
            period_end: null,
            created_at: "2026-10-15T00:00:00.000Z",
        };
        paymentsRepoMock.listForUser.mockResolvedValue([
            { ...payment, user_id: userId, stripe_event_id: "evt_1", stripe_object_id: "pi_1" },
        ]);
        const res = await request(server).get("/payments").set("Cookie", cookie);
        expect(res.status).toBe(200);
        const body: iResponse = JSON.parse(res.text);
        expect(body.data).toEqual([payment]);
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

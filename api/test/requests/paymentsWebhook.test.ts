import request from "supertest";

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
    webhooks: { constructEvent: jest.fn() },
    customers: { update: jest.fn() },
    subscriptions: { retrieve: jest.fn() },
    charges: { retrieve: jest.fn() },
};
jest.mock("../../config/stripe", () => ({ __esModule: true, default: mockStripe }));

// A fake client is enough here: the repo methods it's passed to are
// themselves fully mocked above, so nothing ever issues a real query against
// it - this keeps the route test from depending on a reachable database.
const fakeClient = { query: jest.fn() };
jest.mock("../../config/db", () => ({
    __esModule: true,
    withTransaction: (fn: (client: unknown) => Promise<unknown>) => fn(fakeClient),
}));

import server from "../server";

afterAll(() => server.close());

const oneTimeEvent = {
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: {
        object: {
            id: "pi_1",
            customer: "cus_1",
            amount: 1000,
            amount_received: 1000,
            metadata: {
                kind: "checkout_one_time",
                user_id: "u1",
                design_id: "",
                amount_total_cents: "1000",
                amount_platform_cents: "300",
                amount_charity_cents: "700",
            },
        },
    },
};

beforeEach(() => {
    billingRepoMock.__reset();
    paymentsRepoMock.__reset();
    selectionsRepoMock.__reset();
    usersRepoMock.__reset();
    backfillJobsRepoMock.__reset();
    mockStripe.webhooks.constructEvent.mockReset();

    billingRepoMock.getByStripeCustomerId.mockResolvedValue({ user_id: "u1" });
    paymentsRepoMock.existsByStripeEventId.mockResolvedValue(false);
    paymentsRepoMock.create.mockResolvedValue({ id: "p1" });
});

describe("POST /payments/webhook", () => {
    it("400s when the signature can't be verified", async () => {
        mockStripe.webhooks.constructEvent.mockImplementation(() => {
            throw new Error("No signatures found matching the expected signature for payload");
        });

        const res = await request(server)
            .post("/payments/webhook")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ hello: "world" }));

        expect(res.status).toBe(400);
        expect(billingRepoMock.bumpPaidUntilOneYear).not.toHaveBeenCalled();
    });

    it("200s and dispatches a verified event", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue(oneTimeEvent);

        const res = await request(server)
            .post("/payments/webhook")
            .set("Content-Type", "application/json")
            .set("stripe-signature", "t=1,v1=deadbeef")
            .send(JSON.stringify(oneTimeEvent));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });
        expect(paymentsRepoMock.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1" }), fakeClient);
    });

    it("verifies against the raw body (json body parser did not consume it first)", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue({ id: "evt_x", type: "customer.created", data: { object: {} } });

        await request(server)
            .post("/payments/webhook")
            .set("Content-Type", "application/json")
            .set("stripe-signature", "sig")
            .send(JSON.stringify({ a: 1 }));

        const [rawBody] = mockStripe.webhooks.constructEvent.mock.calls[0];
        expect(Buffer.isBuffer(rawBody)).toBe(true);
    });

    it("500s (so Stripe retries) when dispatch throws", async () => {
        mockStripe.webhooks.constructEvent.mockReturnValue(oneTimeEvent);
        paymentsRepoMock.create.mockRejectedValue(new Error("db down"));

        const res = await request(server)
            .post("/payments/webhook")
            .set("Content-Type", "application/json")
            .set("stripe-signature", "sig")
            .send(JSON.stringify(oneTimeEvent));

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ received: false });
    });
});

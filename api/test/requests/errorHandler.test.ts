import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import { errorHandler } from "../../middleware/errorHandler.middleware";
import server from "../server";

afterAll(() => server.close());

// Shaped like the real thing: StripeInvalidRequestError carries enumerable
// raw/headers/requestId, and pg errors carry detail/constraint/table.
const stripeError = Object.assign(new Error("No such customer: 'cus_X'"), {
    type: "StripeInvalidRequestError",
    raw: { message: "No such customer", headers: { "idempotency-key": "checkout-onetime-u1-d1" } },
    headers: { "request-id": "req_1" },
    requestId: "req_1",
    request_log_url: "https://dashboard.stripe.com/acct_123/workbench/logs",
    statusCode: 400,
});
const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    detail: "Key (stripe_customer_id)=(cus_X) already exists.",
    constraint: "user_billing_stripe_customer_id_unique",
    table: "user_billing",
});

const testApp = express();
testApp.use(express.json());
testApp.get("/stripe", (req: Request, res: Response, next: NextFunction) => next(stripeError));
testApp.get("/pg", (req: Request, res: Response, next: NextFunction) => next(pgError));
testApp.get("/plain", (req: Request, res: Response, next: NextFunction) => next(new Error("secret internal detail")));
testApp.use(errorHandler);

const LEAKY = ["raw", "headers", "request_log_url", "acct_123", "idempotency", "detail", "constraint", "user_billing", "cus_X", "stack", "secret internal detail"];

describe("errorHandler", () => {
    it.each(["/stripe", "/pg", "/plain"])("returns only a generic message with a ref for %s", async (path) => {
        const res = await request(testApp).get(path);

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(typeof res.body.error).toBe("string");
        expect(res.body.error).toMatch(/^Something went wrong\. Please try again\. \(ref: [0-9a-f]{8}\)$/);
        for (const needle of LEAKY) expect(res.text).not.toContain(needle);
    });

    it("passes through an exposed 4xx (malformed JSON) as a 400 without echoing the body", async () => {
        const res = await request(testApp)
            .post("/anything")
            .set("Content-Type", "application/json")
            .send('{"secret": "echo-me",');

        expect(res.status).toBe(400);
        expect(typeof res.body.error).toBe("string");
        expect(res.text).not.toContain("echo-me");
    });
});

describe("app wiring", () => {
    it("uses the errorHandler for malformed JSON on real routes", async () => {
        const res = await request(server)
            .post("/payments/checkout")
            .set("Content-Type", "application/json")
            .send('{"secret": "echo-me",');

        expect(res.status).toBe(400);
        expect(res.text).not.toContain("echo-me");
    });

    it("does not advertise Express via X-Powered-By", async () => {
        const res = await request(server).get("/");
        expect(res.headers["x-powered-by"]).toBeUndefined();
    });
});

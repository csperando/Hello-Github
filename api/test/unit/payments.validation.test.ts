import { extractCheckoutInput } from "../../services/payments.validation";

describe("extractCheckoutInput", () => {
    const valid = {
        totalCents: 1000,
        platformCents: 99,
        designId: "d1",
        attemptId: "3f1c2b9e-8d4a-4c7e-9b1a-2e5f6a7b8c9d",
    };

    it("passes the attemptId through", () => {
        const { input, error } = extractCheckoutInput(valid);
        expect(error).toBeUndefined();
        expect(input?.attemptId).toBe(valid.attemptId);
    });

    it("rejects a missing attemptId", () => {
        const { attemptId: _omit, ...body } = valid;
        expect(extractCheckoutInput(body).error).toMatch(/attemptId/);
    });

    it("rejects an attemptId that isn't a UUID", () => {
        expect(extractCheckoutInput({ ...valid, attemptId: "not-a-uuid" }).error).toMatch(/attemptId/);
    });

    it("requires a designId (every checkout buys one design)", () => {
        const { designId: _omit, ...body } = valid;
        expect(extractCheckoutInput(body).error).toMatch(/designId/);
    });

    it("no longer requires autoRenew (checkout is always one-time)", () => {
        const { input, error } = extractCheckoutInput(valid);
        expect(error).toBeUndefined();
        expect(input).not.toHaveProperty("autoRenew");
    });
});

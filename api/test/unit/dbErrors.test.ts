import { isUniqueViolationOn } from "../../repository/dbErrors";

describe("isUniqueViolationOn", () => {
    it("returns true for a unique-violation error naming the given constraint", () => {
        const err = { code: "23505", constraint: "payments_stripe_event_id_unique" };
        expect(isUniqueViolationOn(err, "payments_stripe_event_id_unique")).toBe(true);
    });

    it("returns false for a unique-violation error naming a different constraint", () => {
        const err = { code: "23505", constraint: "users_github_id_key" };
        expect(isUniqueViolationOn(err, "payments_stripe_event_id_unique")).toBe(false);
    });

    it("returns false for a non-unique-violation error code, even with the matching constraint", () => {
        const err = { code: "23503", constraint: "payments_stripe_event_id_unique" };
        expect(isUniqueViolationOn(err, "payments_stripe_event_id_unique")).toBe(false);
    });

    it("returns false for a unique-violation error with no constraint field", () => {
        const err = { code: "23505" };
        expect(isUniqueViolationOn(err, "payments_stripe_event_id_unique")).toBe(false);
    });

    it("returns false for null, undefined, and non-object errors", () => {
        expect(isUniqueViolationOn(null, "payments_stripe_event_id_unique")).toBe(false);
        expect(isUniqueViolationOn(undefined, "payments_stripe_event_id_unique")).toBe(false);
        expect(isUniqueViolationOn(new Error("boom"), "payments_stripe_event_id_unique")).toBe(false);
        expect(isUniqueViolationOn("23505", "payments_stripe_event_id_unique")).toBe(false);
    });
});

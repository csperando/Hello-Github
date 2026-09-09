import { computeAuthoritativeAmounts } from "../../services/payments.service";
import { config } from "../../config/config";

describe("computeAuthoritativeAmounts", () => {
    it("derives the charity portion as total minus platform", () => {
        const { amounts, error } = computeAuthoritativeAmounts({ totalCents: 1000, platformCents: 300 });
        expect(error).toBeUndefined();
        expect(amounts).toEqual({
            amount_total_cents: 1000,
            amount_platform_cents: 300,
            amount_charity_cents: 700,
        });
    });

    it("allows a platform-only payment (charity portion zero) when platform equals total", () => {
        const { amounts, error } = computeAuthoritativeAmounts({ totalCents: 500, platformCents: 500 });
        expect(error).toBeUndefined();
        expect(amounts?.amount_charity_cents).toBe(0);
    });

    it("accepts a platform cut exactly at the configured floor", () => {
        const { amounts, error } = computeAuthoritativeAmounts({
            totalCents: config.PLATFORM_MIN_CENTS + 100,
            platformCents: config.PLATFORM_MIN_CENTS,
        });
        expect(error).toBeUndefined();
        expect(amounts?.amount_platform_cents).toBe(config.PLATFORM_MIN_CENTS);
    });

    it("rejects a platform cut below the floor", () => {
        const { amounts, error } = computeAuthoritativeAmounts({
            totalCents: 1000,
            platformCents: config.PLATFORM_MIN_CENTS - 1,
        });
        expect(amounts).toBeUndefined();
        expect(error).toMatch(/platform amount must be at least/i);
    });

    it("rejects a platform cut larger than the total", () => {
        const { error } = computeAuthoritativeAmounts({ totalCents: 500, platformCents: 600 });
        expect(error).toMatch(/cannot exceed the total/i);
    });

    it("rejects a total below Stripe's 50-cent minimum", () => {
        const { error } = computeAuthoritativeAmounts({ totalCents: 40, platformCents: 40 });
        expect(error).toMatch(/at least \$0\.50/);
    });

    it("rejects non-integer cents (a dollar amount that slipped through as a float)", () => {
        expect(computeAuthoritativeAmounts({ totalCents: 10.5, platformCents: 5 }).error).toMatch(/whole numbers/i);
        expect(computeAuthoritativeAmounts({ totalCents: 1000, platformCents: 99.9 }).error).toMatch(/whole numbers/i);
    });

    it("rejects a negative platform amount", () => {
        expect(computeAuthoritativeAmounts({ totalCents: 1000, platformCents: -100 }).error).toBeDefined();
    });
});

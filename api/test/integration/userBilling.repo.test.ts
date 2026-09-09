import pool from "../../config/db";
import { runMigrations } from "../../data/migrate";
import UsersRepository from "../../repository/users.repo";
import UserBillingRepository from "../../repository/userBilling.repo";
import DesignsRepository from "../../repository/designs.repo";
import DesignSelectionsRepository from "../../repository/designSelections.repo";
import { iGitHubUpsertInput } from "../../models/users";

describe("UserBillingRepository", () => {
    const usersRepo = UsersRepository.repo();
    const billingRepo = UserBillingRepository.repo();
    const designsRepo = DesignsRepository.repo();
    const selectionsRepo = DesignSelectionsRepository.repo();
    // fixed, out-of-range-for-real-GitHub ids so this test never collides with real data
    const testGitHubId = -104;

    let userId: string;

    beforeAll(async () => {
        await runMigrations();
    });

    beforeEach(async () => {
        const user = await usersRepo.upsertFromGitHub({
            github_id: testGitHubId,
            github_username: "octocat-userbilling-repo-test",
            github_email: "octocat-userbilling-repo-test@example.com",
            github_noreply_email: `${testGitHubId}+octocat-userbilling-repo-test@users.noreply.github.com`,
            github_node_id: "MDE6VXNlcjEwNA==",
            github_profile_url: "https://github.com/octocat-userbilling-repo-test",
            avatar_url: "https://avatars.githubusercontent.com/u/104?v=4",
        } as iGitHubUpsertInput);
        userId = user.id;
    });

    afterEach(async () => {
        await pool.query("DELETE FROM design_selections WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM designs WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM user_billing WHERE user_id = $1;", [userId]);
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    describe("getByUserId", () => {
        it("returns null when the user has never paid (no row)", async () => {
            expect(await billingRepo.getByUserId(userId)).toBeNull();
        });
    });

    describe("upsertCustomerId", () => {
        it("creates the row on first call and updates it on the second", async () => {
            const created = await billingRepo.upsertCustomerId(userId, "cus_a");
            expect(created.stripe_customer_id).toBe("cus_a");
            expect(created.auto_renew).toBe(false);
            expect(created.paid_until).toBeNull();

            const updated = await billingRepo.upsertCustomerId(userId, "cus_b");
            expect(updated.stripe_customer_id).toBe("cus_b");
        });
    });

    describe("getByStripeCustomerId", () => {
        it("finds the row by customer id, or null when unknown", async () => {
            await billingRepo.upsertCustomerId(userId, "cus_lookup");
            const found = await billingRepo.getByStripeCustomerId("cus_lookup");
            expect(found.user_id).toBe(userId);
            expect(await billingRepo.getByStripeCustomerId("cus_missing")).toBeNull();
        });
    });

    describe("updateSubscription", () => {
        it("sets the subscription triple, then a status-only update leaves the id intact", async () => {
            await billingRepo.updateSubscription(userId, {
                stripe_subscription_id: "sub_1",
                subscription_status: "active",
                auto_renew: true,
            });

            const afterStatusOnly = await billingRepo.updateSubscription(userId, { subscription_status: "past_due" });
            expect(afterStatusOnly.stripe_subscription_id).toBe("sub_1");
            expect(afterStatusOnly.subscription_status).toBe("past_due");
            expect(afterStatusOnly.auto_renew).toBe(true);
        });

        it("an explicit auto_renew:false turns it off without disturbing the other fields", async () => {
            await billingRepo.updateSubscription(userId, {
                stripe_subscription_id: "sub_2",
                subscription_status: "active",
                auto_renew: true,
            });

            const cancelled = await billingRepo.updateSubscription(userId, { auto_renew: false });
            expect(cancelled.auto_renew).toBe(false);
            expect(cancelled.stripe_subscription_id).toBe("sub_2");
            expect(cancelled.subscription_status).toBe("active");
        });
    });

    describe("setPaidUntil", () => {
        it("writes the exact instant given", async () => {
            const instant = "2027-03-01T12:00:00.000Z";
            const row = await billingRepo.setPaidUntil(userId, instant);
            expect(new Date(row.paid_until).toISOString()).toBe(instant);
        });
    });

    describe("bumpPaidUntilOneYear", () => {
        it("gives a first-time payer ~one year from now", async () => {
            const row = await billingRepo.bumpPaidUntilOneYear(userId);
            const days = (new Date(row.paid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            expect(days).toBeGreaterThan(360);
            expect(days).toBeLessThan(371);
        });

        it("extends from an existing future paid_until, not from now", async () => {
            await billingRepo.setPaidUntil(userId, "2030-01-01T00:00:00.000Z");
            const row = await billingRepo.bumpPaidUntilOneYear(userId);
            expect(new Date(row.paid_until).toISOString()).toBe("2031-01-01T00:00:00.000Z");
        });

        it("extends from now when the existing paid_until is already in the past", async () => {
            await billingRepo.setPaidUntil(userId, "2000-01-01T00:00:00.000Z");
            const row = await billingRepo.bumpPaidUntilOneYear(userId);
            const days = (new Date(row.paid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            expect(days).toBeGreaterThan(360);
            expect(days).toBeLessThan(371);
        });
    });

    describe("listLapsedActiveUsers", () => {
        const activeSelection = async () => {
            const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
            await selectionsRepo.create(userId, design.id, { start_date: "2026-01-04", is_active: true });
            return design.id;
        };

        it("includes a user with an active selection and no billing row", async () => {
            await activeSelection();
            const lapsed = await billingRepo.listLapsedActiveUsers();
            expect(lapsed).toContainEqual(expect.objectContaining({ user_id: userId }));
        });

        it("includes a user whose paid_until is in the past", async () => {
            await activeSelection();
            await billingRepo.setPaidUntil(userId, "2000-01-01T00:00:00.000Z");
            const lapsed = await billingRepo.listLapsedActiveUsers();
            expect(lapsed).toContainEqual(expect.objectContaining({ user_id: userId }));
        });

        it("excludes a user whose paid_until is in the future", async () => {
            await activeSelection();
            await billingRepo.setPaidUntil(userId, "2100-01-01T00:00:00.000Z");
            const lapsed = await billingRepo.listLapsedActiveUsers();
            expect(lapsed).not.toContainEqual(expect.objectContaining({ user_id: userId }));
        });

        it("excludes a user with no active selection even when lapsed", async () => {
            const design = await designsRepo.create(userId, { pattern: [0, 1, 2, 3, 4, 0, 0] });
            await selectionsRepo.create(userId, design.id, { start_date: "2026-01-04", is_active: false });
            const lapsed = await billingRepo.listLapsedActiveUsers();
            expect(lapsed).not.toContainEqual(expect.objectContaining({ user_id: userId }));
        });
    });
});
